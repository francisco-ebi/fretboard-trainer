import { parseMoveId } from '@/shared/lib/music/fretboardMoves';
import { getStrength, type SrsCard } from './scheduler';

/**
 * Turns review history into a per-(string, interval) mastery reading, for
 * painting practice progress onto a fretboard that is not itself the Practice
 * Mode board — e.g. Scale mode's.
 *
 * A stored card is a *move* — "string 5 to string 6, the 5th" — not a fret
 * position, so there is no direct "this fret is known" fact to read. What is
 * known is how reliably a move *lands* on a given string at a given interval,
 * which is exactly the fact a learner draws on to find a scale degree there.
 * A cell's heat is the average strength of every stored move whose
 * destination matches its string and its interval from the root — so it is
 * necessarily an approximation (a cell can be warmed by moves practised at a
 * different stage or skip setting than the one currently selected), but it is
 * the only reading that survives a key change, which a per-fret map would not.
 */
export type StrengthIndex = Map<string, number>;

const cellKey = (stringIndex: number, interval: number): string => `${stringIndex}:${interval}`;

export const buildStrengthIndex = (cards: Record<string, SrsCard>): StrengthIndex => {
    const totals = new Map<string, { sum: number; count: number }>();

    for (const card of Object.values(cards)) {
        const move = parseMoveId(card.id);
        if (!move) continue; // ids from a since-removed deck shape; ignore rather than crash

        const key = cellKey(move.to, move.interval);
        const entry = totals.get(key) ?? { sum: 0, count: 0 };
        entry.sum += getStrength(card);
        entry.count += 1;
        totals.set(key, entry);
    }

    const index: StrengthIndex = new Map();
    for (const [key, { sum, count }] of totals) index.set(key, sum / count);
    return index;
};

/** 0 for a cell with no move history landing there — cold, not an error. */
export const getCellStrength = (
    index: StrengthIndex,
    stringIndex: number,
    semitoneInterval: number
): number => index.get(cellKey(stringIndex, semitoneInterval)) ?? 0;
