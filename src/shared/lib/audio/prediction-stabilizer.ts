import { merge, of, timer, type Observable } from 'rxjs';
import { filter, map, scan, switchMap } from 'rxjs/operators';

// Decode-side stabilization of raw per-sequence predictions.
//
// Raw predictions arrive one per hop (~23ms) and are noisy; a (string, fret)
// pair must dominate a small sliding vote window before it is emitted, and an
// emitted value auto-clears after a silence timeout.
//
// The window RESETS on every pluck onset: votes for the previous (possibly
// still-ringing) note would otherwise have to be out-voted by the new note —
// ~100ms of added flip latency, and a total block when the monophonic pitch
// tracker alternates between two simultaneously sounding strings. After a
// reset the majority may resolve on a partial window (≥ MIN_VOTES votes at
// MAJORITY_RATIO of its length — unanimity until the window refills), so a
// fresh pluck emits fast.

export const VOTE_WINDOW = 5;
export const MIN_VOTES = 3;
export const MAJORITY_RATIO = 0.7;
export const CLEAR_AFTER_MS = 5000;

export function stabilizePredictions<T>(
    raw$: Observable<T>,
    reset$: Observable<void>,
    keyOf: (value: T) => string,
    clearAfterMs: number = CLEAR_AFTER_MS
): Observable<T | null> {
    type VoteEvent = { kind: 'vote'; value: T } | { kind: 'reset' };

    const windows$ = merge(
        raw$.pipe(map((value): VoteEvent => ({ kind: 'vote', value }))),
        reset$.pipe(map((): VoteEvent => ({ kind: 'reset' })))
    ).pipe(
        scan((votes: T[], event: VoteEvent) => {
            if (event.kind === 'reset') return [];
            const next = votes.length >= VOTE_WINDOW ? votes.slice(1) : votes.slice();
            next.push(event.value);
            return next;
        }, [])
    );

    const stable$ = windows$.pipe(
        map((votes) => {
            if (votes.length < MIN_VOTES) return null;
            const threshold = Math.ceil(votes.length * MAJORITY_RATIO);
            const counts = new Map<string, { count: number; value: T }>();
            for (const vote of votes) {
                const key = keyOf(vote);
                const entry = counts.get(key) ?? { count: 0, value: vote };
                entry.count++;
                counts.set(key, entry);
            }
            for (const { count, value } of counts.values()) {
                if (count >= threshold) return value;
            }
            return null;
        }),
        filter((value): value is T => value !== null)
    );

    // Each stable value (or repeat) restarts the silence timer; after
    // clearAfterMs without one, emit null so the UI clears its marker.
    return stable$.pipe(
        switchMap((value) => merge(of(value), timer(clearAfterMs).pipe(map(() => null))))
    );
}
