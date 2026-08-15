import { describe, it, expect } from 'vitest';
import {
    STAGES,
    crossesIrregularPair,
    deltaAlternatives,
    enumerateMoves,
    findDelta,
    getAdjacentGaps,
    getIrregularPairs,
    getOpenStringPitches,
    intervalOf,
    isOnBoard,
    isPlayableFrom,
    makeContextKey,
    moveId,
    parseMoveId,
    playableAnchorFrets,
    targetOf
} from './fretboardMoves';

// String indices follow the fretboard renderer: 0 is drawn first (high E on a
// standard guitar), so "string 5" in player-speak is index 4.
const GUITAR = getOpenStringPitches('GUITAR', 6);
const STR_1 = 0, STR_2 = 1, STR_3 = 2, STR_4 = 3, STR_5 = 4, STR_6 = 5;

const FIFTH = 7, FOURTH = 5, MAJOR_THIRD = 4, MINOR_THIRD = 3, UNISON = 0, MAJOR_SECOND = 2;

describe('getOpenStringPitches', () => {
    it('returns standard guitar tuning high-to-low', () => {
        expect(GUITAR).toEqual([52, 47, 43, 38, 33, 28]);
    });

    it('applies tuning offsets per string', () => {
        expect(getOpenStringPitches('GUITAR', 6, [0, 0, 0, 0, 0, -2])).toEqual([52, 47, 43, 38, 33, 26]);
    });

    it('handles extended string counts', () => {
        expect(getOpenStringPitches('GUITAR', 8)).toHaveLength(8);
        expect(getOpenStringPitches('BASS')).toEqual([31, 26, 21, 16]);
    });
});

describe('intervalOf', () => {
    // The property the whole feature rests on. If this ever fails, a move stops
    // being a transposable unit and the deck design collapses.
    it('is independent of the starting fret', () => {
        for (let from = 0; from < 6; from++) {
            for (let to = 0; to < 6; to++) {
                for (let delta = -6; delta <= 6; delta++) {
                    const reference = intervalOf(GUITAR, from, to, delta);
                    for (let fret = 0; fret <= 18; fret++) {
                        // Recompute from absolute pitches at this fret.
                        const start = GUITAR[from] + fret;
                        const end = GUITAR[to] + fret + delta;
                        expect((((end - start) % 12) + 12) % 12).toBe(reference);
                    }
                }
            }
        }
    });

    it('gives the 5th moving from string 5 to string 6 at the same fret', () => {
        expect(intervalOf(GUITAR, STR_5, STR_6, 0)).toBe(FIFTH);
    });

    it('gives the 4th moving from string 6 to string 5 at the same fret', () => {
        expect(intervalOf(GUITAR, STR_6, STR_5, 0)).toBe(FOURTH);
    });

    it('shifts by one fret across the B/G pair', () => {
        // Every other adjacent pair yields the 5th at delta 0; B->G needs -1.
        expect(intervalOf(GUITAR, STR_1, STR_2, 0)).toBe(FIFTH);
        expect(intervalOf(GUITAR, STR_2, STR_3, 0)).not.toBe(FIFTH);
        expect(intervalOf(GUITAR, STR_2, STR_3, -1)).toBe(FIFTH);
    });
});

describe('findDelta', () => {
    it('inverts intervalOf for every pair and interval', () => {
        for (let from = 0; from < 6; from++) {
            for (let to = 0; to < 6; to++) {
                for (let interval = 0; interval < 12; interval++) {
                    const delta = findDelta(GUITAR, from, to, interval);
                    expect(intervalOf(GUITAR, from, to, delta)).toBe(interval);
                }
            }
        }
    });

    it('matches the known adjacent-pair table for the 5th', () => {
        expect(findDelta(GUITAR, STR_1, STR_2, FIFTH)).toBe(0);
        expect(findDelta(GUITAR, STR_2, STR_3, FIFTH)).toBe(-1);
        expect(findDelta(GUITAR, STR_3, STR_4, FIFTH)).toBe(0);
        expect(findDelta(GUITAR, STR_4, STR_5, FIFTH)).toBe(0);
        expect(findDelta(GUITAR, STR_5, STR_6, FIFTH)).toBe(0);
    });

    it('matches the known adjacent-pair table for the major third', () => {
        expect(findDelta(GUITAR, STR_1, STR_2, MAJOR_THIRD)).toBe(-3);
        expect(findDelta(GUITAR, STR_2, STR_3, MAJOR_THIRD)).toBe(-4);
        expect(findDelta(GUITAR, STR_5, STR_6, MAJOR_THIRD)).toBe(-3);
    });

    it('normalises to the smallest hand movement', () => {
        for (let from = 0; from < 6; from++) {
            for (let to = 0; to < 6; to++) {
                for (let interval = 0; interval < 12; interval++) {
                    const delta = findDelta(GUITAR, from, to, interval);
                    expect(delta).toBeGreaterThan(-6);
                    expect(delta).toBeLessThanOrEqual(6);
                }
            }
        }
    });

    it('resolves the 6-fret tie positive so low anchors stay on the board', () => {
        expect(findDelta(GUITAR, STR_2, STR_3, MAJOR_SECOND)).toBe(6);
    });

    it('gives the unison shape across two strings', () => {
        // The classic octave grips: three frets back on the treble side, two on the bass side.
        expect(findDelta(GUITAR, STR_1, STR_3, UNISON)).toBe(-3);
        expect(findDelta(GUITAR, STR_4, STR_6, UNISON)).toBe(-2);
    });
});

describe('deltaAlternatives', () => {
    it('lists octave-shifted displacements nearest-first', () => {
        const options = deltaAlternatives(GUITAR, STR_5, STR_6, FIFTH, 18);
        expect(options[0]).toBe(0);
        expect(options).toContain(12);
        expect(options).toContain(-12);
        for (const delta of options) {
            expect(intervalOf(GUITAR, STR_5, STR_6, delta)).toBe(FIFTH);
        }
    });

    it('drops displacements longer than the neck', () => {
        expect(deltaAlternatives(GUITAR, STR_5, STR_6, FIFTH, 6)).toEqual([0]);
    });
});

describe('getIrregularPairs', () => {
    it('finds the single B/G pair on a standard guitar', () => {
        expect(getAdjacentGaps(GUITAR)).toEqual([5, 4, 5, 5, 5]);
        expect(getIrregularPairs(GUITAR)).toEqual([STR_2]);
    });

    it('finds none on a bass, which is tuned in uniform fourths', () => {
        expect(getIrregularPairs(getOpenStringPitches('BASS'))).toEqual([]);
    });

    it('keeps the B/G pair on a 7- and 8-string guitar', () => {
        expect(getIrregularPairs(getOpenStringPitches('GUITAR', 7))).toEqual([STR_2]);
        expect(getIrregularPairs(getOpenStringPitches('GUITAR', 8))).toEqual([STR_2]);
    });

    it('reports the extra irregular pair introduced by Drop D', () => {
        const dropD = getOpenStringPitches('GUITAR', 6, [0, 0, 0, 0, 0, -2]);
        expect(getAdjacentGaps(dropD)).toEqual([5, 4, 5, 5, 7]);
        expect(getIrregularPairs(dropD)).toEqual([STR_2, STR_5]);
    });
});

describe('crossesIrregularPair', () => {
    it('is true only when the span includes the B/G boundary', () => {
        expect(crossesIrregularPair(GUITAR, STR_2, STR_3)).toBe(true);
        expect(crossesIrregularPair(GUITAR, STR_3, STR_2)).toBe(true);
        expect(crossesIrregularPair(GUITAR, STR_1, STR_3)).toBe(true);
        expect(crossesIrregularPair(GUITAR, STR_4, STR_6)).toBe(false);
        expect(crossesIrregularPair(GUITAR, STR_3, STR_5)).toBe(false);
    });
});

describe('enumerateMoves', () => {
    it('covers both directions of every adjacent pair', () => {
        const moves = enumerateMoves(GUITAR, { intervals: [FIFTH], skips: [1] });
        expect(moves).toHaveLength(10); // 5 pairs x 2 directions
        expect(new Set(moves.map(moveId)).size).toBe(10);
        for (const move of moves) {
            expect(Math.abs(move.to - move.from)).toBe(1);
            expect(intervalOf(GUITAR, move.from, move.to, move.delta)).toBe(FIFTH);
        }
    });

    it('scales with the skip parameter', () => {
        const skips = enumerateMoves(GUITAR, { intervals: [FIFTH], skips: [1, 2] });
        expect(skips).toHaveLength(10 + 8); // 2 x (6-1) + 2 x (6-2)
    });

    it('scales with string count for extended-range guitars', () => {
        const eight = getOpenStringPitches('GUITAR', 8);
        expect(enumerateMoves(eight, { intervals: [FIFTH], skips: [1] })).toHaveLength(14);
        expect(enumerateMoves(eight, { intervals: [FIFTH], skips: [1, 2] })).toHaveLength(14 + 12);
    });

    it('grows the deck stage by stage', () => {
        const sizes = (['ROOT_AND_FIFTH', 'TRIADS', 'PENTATONIC', 'FULL_SCALE'] as const)
            .map(stage => enumerateMoves(GUITAR, { intervals: STAGES[stage], skips: [1] }).length);
        expect(sizes).toEqual([20, 40, 60, 90]);
    });

    it('keeps every later stage a superset of the one before', () => {
        const ids = (intervals: readonly number[]) =>
            new Set(enumerateMoves(GUITAR, { intervals, skips: [1] }).map(moveId));
        const triads = ids(STAGES.TRIADS);
        for (const id of ids(STAGES.ROOT_AND_FIFTH)) expect(triads.has(id)).toBe(true);
        const pentatonic = ids(STAGES.PENTATONIC);
        for (const id of triads) expect(pentatonic.has(id)).toBe(true);
    });

    it('ignores skips that cannot fit the instrument', () => {
        expect(enumerateMoves(GUITAR, { intervals: [FIFTH], skips: [9] })).toEqual([]);
        expect(enumerateMoves(GUITAR, { intervals: [FIFTH], skips: [0] })).toEqual([]);
    });
});

describe('moveId', () => {
    it('round-trips through parseMoveId', () => {
        for (const move of enumerateMoves(GUITAR, { intervals: STAGES.PENTATONIC, skips: [1, 2] })) {
            expect(parseMoveId(moveId(move))).toEqual({ from: move.from, to: move.to, interval: move.interval });
        }
    });

    it('rejects malformed ids', () => {
        expect(parseMoveId('nonsense')).toBeNull();
        expect(parseMoveId('4>5')).toBeNull();
    });
});

describe('makeContextKey', () => {
    it('separates instruments and string counts', () => {
        expect(makeContextKey('GUITAR', 6)).toBe('GUITAR-6');
        expect(makeContextKey('GUITAR', 7)).toBe('GUITAR-7');
        expect(makeContextKey('BASS')).toBe('BASS-4');
    });

    it('treats standard tuning and all-zero offsets as the same context', () => {
        expect(makeContextKey('GUITAR', 6, [0, 0, 0, 0, 0, 0])).toBe(makeContextKey('GUITAR', 6));
    });

    it('separates a retuned instrument, whose move geometry differs', () => {
        expect(makeContextKey('GUITAR', 6, [0, 0, 0, 0, 0, -2])).not.toBe(makeContextKey('GUITAR', 6));
    });
});

describe('board geometry', () => {
    const move = { from: STR_5, to: STR_6, delta: 0, interval: FIFTH };

    it('projects an anchor onto the destination string', () => {
        expect(targetOf({ stringIndex: STR_5, fret: 12 }, move)).toEqual({ stringIndex: STR_6, fret: 12 });
    });

    it('lists anchors keeping both ends on the neck', () => {
        const back3 = { from: STR_1, to: STR_2, delta: -3, interval: MAJOR_THIRD };
        const frets = playableAnchorFrets(back3, 18);
        expect(frets[0]).toBe(3);
        expect(frets[frets.length - 1]).toBe(18);

        const forward6 = { from: STR_2, to: STR_3, delta: 6, interval: MAJOR_SECOND };
        const forwardFrets = playableAnchorFrets(forward6, 18);
        expect(forwardFrets[0]).toBe(0);
        expect(forwardFrets[forwardFrets.length - 1]).toBe(12);
    });

    it('returns no anchors when the displacement exceeds the neck', () => {
        expect(playableAnchorFrets({ from: STR_1, to: STR_2, delta: -8, interval: MINOR_THIRD }, 6)).toEqual([]);
    });

    it('rejects anchors on the wrong string or off the neck', () => {
        expect(isPlayableFrom({ stringIndex: STR_5, fret: 5 }, move, 18)).toBe(true);
        expect(isPlayableFrom({ stringIndex: STR_4, fret: 5 }, move, 18)).toBe(false);
        expect(isPlayableFrom({ stringIndex: STR_5, fret: 19 }, move, 18)).toBe(false);

        const back3 = { from: STR_1, to: STR_2, delta: -3, interval: MAJOR_THIRD };
        expect(isPlayableFrom({ stringIndex: STR_1, fret: 2 }, back3, 18)).toBe(false);
        expect(isPlayableFrom({ stringIndex: STR_1, fret: 3 }, back3, 18)).toBe(true);
    });

    it('bounds anchors to the rendered board', () => {
        expect(isOnBoard({ stringIndex: 0, fret: 0 }, 6, 18)).toBe(true);
        expect(isOnBoard({ stringIndex: 6, fret: 0 }, 6, 18)).toBe(false);
        expect(isOnBoard({ stringIndex: 0, fret: -1 }, 6, 18)).toBe(false);
    });
});
