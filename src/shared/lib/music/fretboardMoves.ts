import { getInstrumentConfig, type Instrument } from './musicTheory';

/**
 * Intervals as *moves* on the fretboard grid.
 *
 * The whole model rests on one fact: the interval produced by leaving string
 * `from` and landing on string `to` with a fret displacement `delta` depends
 * only on the two open-string pitches and the delta — never on which fret you
 * started from. Moving from the A string to the low E string at the same fret
 * always yields the 5th, at fret 3 as much as at fret 12.
 *
 * That makes a move a transposition- and position-independent unit of
 * knowledge, which is exactly what a spaced-repetition deck wants: one item
 * generates unlimited questions, so the learner cannot memorise the question
 * instead of the answer.
 */

// A move's fret displacement, applied on the destination string.
export interface MoveSpec {
    from: number;       // string index (0 = the string drawn first, highest pitch on standard tunings)
    to: number;         // string index
    delta: number;      // frets to add on the destination string
    interval: number;   // semitone class 0-11 that the move produces
}

export interface Anchor {
    stringIndex: number;
    fret: number;
}

// Semitone classes, named for the deck definitions below. Display should go
// through musicTheory.getInterval so spelling stays diatonic (b3 vs #2); these
// are pitch classes and deliberately spelling-agnostic.
export const INTERVAL_UNISON = 0;
export const INTERVAL_MINOR_THIRD = 3;
export const INTERVAL_MAJOR_THIRD = 4;
export const INTERVAL_FOURTH = 5;
export const INTERVAL_FIFTH = 7;
export const INTERVAL_MAJOR_SIXTH = 9;
export const INTERVAL_MINOR_SEVENTH = 10;
export const INTERVAL_MAJOR_SECOND = 2;
export const INTERVAL_MAJOR_SEVENTH = 11;

/**
 * The curriculum ladder: each stage adds intervals to the previous one, so a
 * later stage re-reviews everything the learner already built. Stage 3 is the
 * pentatonic (1 b3 4 5 b7 read as moves rather than as a box shape).
 */
export const STAGES = {
    ROOT_AND_FIFTH: [INTERVAL_FIFTH, INTERVAL_UNISON],
    TRIADS: [INTERVAL_FIFTH, INTERVAL_UNISON, INTERVAL_MAJOR_THIRD, INTERVAL_MINOR_THIRD],
    PENTATONIC: [
        INTERVAL_FIFTH, INTERVAL_UNISON, INTERVAL_MAJOR_THIRD, INTERVAL_MINOR_THIRD,
        INTERVAL_FOURTH, INTERVAL_MINOR_SEVENTH
    ],
    FULL_SCALE: [
        INTERVAL_FIFTH, INTERVAL_UNISON, INTERVAL_MAJOR_THIRD, INTERVAL_MINOR_THIRD,
        INTERVAL_FOURTH, INTERVAL_MINOR_SEVENTH,
        INTERVAL_MAJOR_SECOND, INTERVAL_MAJOR_SIXTH, INTERVAL_MAJOR_SEVENTH
    ]
} as const;

export type StageId = keyof typeof STAGES;
export const STAGE_ORDER: StageId[] = ['ROOT_AND_FIFTH', 'TRIADS', 'PENTATONIC', 'FULL_SCALE'];

/**
 * Absolute semitone value of each open string, tuning offsets applied. Every
 * geometry function below takes this array rather than an instrument name, so
 * altered tunings and non-standard string counts are handled by construction
 * instead of by special cases.
 */
export const getOpenStringPitches = (
    instrument: Instrument,
    stringCount?: number,
    tuningOffsets?: number[]
): number[] => {
    const config = getInstrumentConfig(instrument, stringCount);
    return config.baseSemitones.map((semitones, i) => semitones + (tuningOffsets?.[i] ?? 0));
};

/** The interval class produced by moving `from` -> `to` with `delta` frets. */
export const intervalOf = (pitches: number[], from: number, to: number, delta: number): number => {
    const semitones = (pitches[to] + delta) - pitches[from];
    return ((semitones % 12) + 12) % 12;
};

/**
 * The fret displacement that realises `interval` across a string pair.
 *
 * Normalised to (-6, 6] — the smallest hand movement. A displacement of
 * exactly 6 is equally far in either direction; it canonicalises positive so
 * low anchors stay on the board. Callers that hit a board edge should use
 * deltaAlternatives instead of assuming this one fits.
 */
export const findDelta = (pitches: number[], from: number, to: number, interval: number): number => {
    const gap = pitches[to] - pitches[from];
    let delta = (((interval - gap) % 12) + 12) % 12;
    if (delta > 6) delta -= 12;
    return delta;
};

/**
 * Every displacement realising `interval`, nearest-first. Successive entries
 * are an octave (12 frets) apart, so this is what a question generator falls
 * back to when the canonical delta runs off the end of the neck.
 */
export const deltaAlternatives = (
    pitches: number[],
    from: number,
    to: number,
    interval: number,
    maxFret: number
): number[] => {
    const canonical = findDelta(pitches, from, to, interval);
    const options: number[] = [];
    for (let octave = -2; octave <= 2; octave++) {
        const delta = canonical + octave * 12;
        if (Math.abs(delta) <= maxFret) options.push(delta);
    }
    return options.sort((a, b) => Math.abs(a) - Math.abs(b));
};

/** Pitch distance between neighbouring strings, index i = between i and i+1. */
export const getAdjacentGaps = (pitches: number[]): number[] => {
    const gaps: number[] = [];
    for (let i = 0; i + 1 < pitches.length; i++) gaps.push(pitches[i] - pitches[i + 1]);
    return gaps;
};

/**
 * String pairs whose spacing differs from the instrument's most common
 * spacing — on a standard guitar, the single B/G major third that shifts every
 * move by one fret. Derived rather than hardcoded: Drop D grows a second
 * irregular pair, and a bass has none at all.
 */
export const getIrregularPairs = (pitches: number[]): number[] => {
    const gaps = getAdjacentGaps(pitches);
    if (gaps.length === 0) return [];

    const tally = new Map<number, number>();
    for (const gap of gaps) tally.set(gap, (tally.get(gap) ?? 0) + 1);

    let modal = gaps[0];
    let best = 0;
    for (const [gap, count] of tally) {
        if (count > best) { modal = gap; best = count; }
    }

    return gaps.reduce<number[]>((acc, gap, i) => (gap === modal ? acc : [...acc, i]), []);
};

/** True when the move crosses a string pair with irregular spacing. */
export const crossesIrregularPair = (pitches: number[], from: number, to: number): boolean => {
    const irregular = new Set(getIrregularPairs(pitches));
    const low = Math.min(from, to);
    const high = Math.max(from, to);
    for (let i = low; i < high; i++) if (irregular.has(i)) return true;
    return false;
};

// --- Deck construction ---

export interface DeckOptions {
    intervals: readonly number[];
    /** How many strings a move may cross. [1] = adjacent only; [1, 2] adds skips. */
    skips: readonly number[];
}

/**
 * Every move available under the given options, both directions. Item count is
 * `intervals x 2 x sum(stringCount - skip)`, so an 8-string with skips [1,2]
 * stays well inside a workable deck size.
 */
export const enumerateMoves = (pitches: number[], options: DeckOptions): MoveSpec[] => {
    const moves: MoveSpec[] = [];
    const stringCount = pitches.length;

    for (const skip of options.skips) {
        if (skip < 1) continue;
        for (let from = 0; from < stringCount; from++) {
            for (const to of [from + skip, from - skip]) {
                if (to < 0 || to >= stringCount) continue;
                for (const interval of options.intervals) {
                    moves.push({ from, to, delta: findDelta(pitches, from, to, interval), interval });
                }
            }
        }
    }
    return moves;
};

/** Stable id for one move within a tuning context. */
export const moveId = (move: Pick<MoveSpec, 'from' | 'to' | 'interval'>): string =>
    `${move.from}>${move.to}:${move.interval}`;

export const parseMoveId = (id: string): { from: number; to: number; interval: number } | null => {
    const match = /^(\d+)>(\d+):(\d+)$/.exec(id);
    if (!match) return null;
    return { from: Number(match[1]), to: Number(match[2]), interval: Number(match[3]) };
};

/**
 * Namespaces a deck to its tuning. The same id means a different move after a
 * retune, so review history must not carry across — an offsets suffix keeps
 * Drop D progress separate from standard without a migration.
 */
export const makeContextKey = (
    instrument: Instrument,
    stringCount?: number,
    tuningOffsets?: number[]
): string => {
    const config = getInstrumentConfig(instrument, stringCount);
    const base = `${instrument}-${config.strings}`;
    const offsets = config.baseSemitones.map((_, i) => tuningOffsets?.[i] ?? 0);
    return offsets.some(o => o !== 0) ? `${base}-${offsets.join('.')}` : base;
};

// --- Board geometry ---

export const targetOf = (anchor: Anchor, move: MoveSpec): Anchor => ({
    stringIndex: move.to,
    fret: anchor.fret + move.delta
});

export const isOnBoard = (anchor: Anchor, stringCount: number, maxFret: number): boolean =>
    anchor.stringIndex >= 0 && anchor.stringIndex < stringCount &&
    anchor.fret >= 0 && anchor.fret <= maxFret;

/**
 * Frets on the origin string from which both ends of the move land on the
 * neck. Empty when the displacement is larger than the board itself.
 */
export const playableAnchorFrets = (move: MoveSpec, maxFret: number): number[] => {
    const lowest = Math.max(0, -move.delta);
    const highest = Math.min(maxFret, maxFret - move.delta);
    const frets: number[] = [];
    for (let fret = lowest; fret <= highest; fret++) frets.push(fret);
    return frets;
};

export const isPlayableFrom = (anchor: Anchor, move: MoveSpec, maxFret: number): boolean =>
    anchor.stringIndex === move.from &&
    anchor.fret >= 0 && anchor.fret <= maxFret &&
    anchor.fret + move.delta >= 0 && anchor.fret + move.delta <= maxFret;
