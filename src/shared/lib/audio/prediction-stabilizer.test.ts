import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Subject } from 'rxjs';
import { stabilizePredictions, VOTE_WINDOW, CLEAR_AFTER_MS } from './prediction-stabilizer';

interface Vote {
    string: number;
    fret: number;
}

const keyOf = (vote: Vote) => `${vote.string}-${vote.fret}`;
const A: Vote = { string: 4, fret: 7 }; // e.g. E3 on the A string
const B: Vote = { string: 3, fret: 2 }; // e.g. E3 on the D string

describe('prediction stabilizer', () => {
    let raw$: Subject<Vote>;
    let reset$: Subject<void>;
    let emissions: Array<Vote | null>;
    let unsubscribe: () => void;

    beforeEach(() => {
        vi.useFakeTimers();
        raw$ = new Subject<Vote>();
        reset$ = new Subject<void>();
        emissions = [];
        const subscription = stabilizePredictions(raw$, reset$, keyOf).subscribe((value) =>
            emissions.push(value)
        );
        unsubscribe = () => subscription.unsubscribe();
    });

    afterEach(() => {
        unsubscribe();
        vi.useRealTimers();
    });

    it('emits after three unanimous votes from a cold start', () => {
        raw$.next(A);
        raw$.next(A);
        expect(emissions).toEqual([]);
        raw$.next(A);
        expect(emissions).toEqual([A]);
    });

    it('requires 4 of 5 once the window is full (legacy behavior preserved)', () => {
        for (let i = 0; i < VOTE_WINDOW; i++) raw$.next(A);
        emissions.length = 0;

        // Without a reset, a note change must out-vote the stale entries
        raw$.next(B); // A A A A B — A still wins (and re-emits)
        raw$.next(B); // A A A B B — no winner
        raw$.next(B); // A A B B B — 3/5 is below the 4-vote threshold
        expect(emissions).not.toContainEqual(B);
        raw$.next(B); // A B B B B — now B wins
        expect(emissions[emissions.length - 1]).toEqual(B);
    });

    it('flips with three unanimous votes after an onset reset', () => {
        for (let i = 0; i < VOTE_WINDOW; i++) raw$.next(A);
        emissions.length = 0;

        reset$.next(); // pluck onset: stale votes discarded
        raw$.next(B);
        raw$.next(B);
        expect(emissions).toEqual([]);
        raw$.next(B);
        expect(emissions).toEqual([B]);
    });

    it('never emits while the tracker alternates between two notes', () => {
        reset$.next();
        raw$.next(A);
        raw$.next(B);
        raw$.next(A);
        raw$.next(B);
        raw$.next(A); // 3/5 for A — below the full-window threshold
        expect(emissions).toEqual([]);
    });

    it('auto-clears after the silence timeout and re-emits on new votes', () => {
        raw$.next(A);
        raw$.next(A);
        raw$.next(A);
        expect(emissions).toEqual([A]);

        vi.advanceTimersByTime(CLEAR_AFTER_MS);
        expect(emissions).toEqual([A, null]);

        raw$.next(A); // window still holds enough agreement
        expect(emissions).toEqual([A, null, A]);
    });

    it('keeps the marker alive while stable votes continue', () => {
        raw$.next(A);
        raw$.next(A);
        raw$.next(A);
        vi.advanceTimersByTime(3000);
        raw$.next(A); // restarts the silence timer
        vi.advanceTimersByTime(3000);
        expect(emissions.filter((value) => value === null)).toHaveLength(0);
        vi.advanceTimersByTime(CLEAR_AFTER_MS - 3000);
        expect(emissions[emissions.length - 1]).toBeNull();
    });
});
