import { getInstrumentConfig, CHORD_INTERVALS, type Note, type Instrument, type ChordQuality } from './musicTheory';

export interface Voicing {
    frets: number[]; // Index maps to string index (0 is usually High E for standard Guitar config)
    startFret: number; // Lowest played fret (excluding 0). Used to anchor badges.
    score: number; // Lower = more idiomatic / comfortable
}

// Scoring weights (lower total = better). Tuned so the canonical grips
// (x32010, x02220, 320003, 022100, xx0232, 133211...) rank first for the
// common qualities, followed by the standard barre shapes up the neck.
const WEIGHTS = {
    ROOT_BASS: -60,          // root in the bass is the dictionary default
    FIFTH_BASS: 15,          // 5th in the bass is tolerable
    OTHER_BASS: 30,          // 3rd/7th inversions rank last
    OPEN_STRING_LOW: -12,    // open strings define the classic low grips
    OPEN_STRING_HIGH: 8,     // but mixed into high positions they stop making sense
    MUTED_STRING: 15,        // fuller voicings are preferred
    INTERNAL_MUTE: 25,       // finger-shadow mutes work but are harder to strum
    PER_FINGER: 3,           // fewer fingers = easier grip
    BARRE: 12,               // a barre is harder than an open shape
    BARRE_FULL_HAND: 5,      // barre plus all remaining fingers is the hardest grip
    MINI_BARRE: 4,           // flattening ring/pinky over 2-3 strings costs a bit
    WIDE_SPAN_LOW: 12,       // 4-fret boxes are a stretch near the nut...
    WIDE_SPAN_HIGH: 6,       // ...and merely uncomfortable higher up
    PER_START_FRET: 2,       // the canonical grip is the lowest comfortable one
    DOUBLED_COLOR_TONE: 8,   // doubling 3rds/7ths/tensions sounds thick
    MUDDY_INTERVAL: 10       // tight intervals deep in the bass get muddy
} as const;

const NUT_REGION_END = 4;       // frets 1-4 are wide: stretches cost extra there
const OPEN_GRIP_MAX_FRET = 4;   // highest fretted fret that still blends with open strings
const MUDDY_PITCH_CEILING = 35; // B2 in semitones-from-C0 (the baseSemitones scale)

// ---------------------------------------------------------------------------
// Pitch helpers
// ---------------------------------------------------------------------------

const LETTER_PITCH_CLASSES: Record<string, number> = {
    'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
};

// Parses every spelling the theory layer can produce ('#', 'b', 'x', 'bb') so
// enharmonic spellings (B# vs C, Fx vs G) compare equal on the fretboard.
function noteToPitchClass(note: Note): number {
    const base = LETTER_PITCH_CLASSES[note.charAt(0)];
    if (base === undefined) return -1;
    let pc = base;
    for (let i = 1; i < note.length; i++) {
        const mod = note.charAt(i);
        if (mod === '#') pc += 1;
        else if (mod === 'b') pc -= 1;
        else if (mod === 'x') pc += 2;
    }
    return ((pc % 12) + 12) % 12;
}

// ---------------------------------------------------------------------------
// Chord profile: which tones a grip must keep and which it may drop
// ---------------------------------------------------------------------------

interface ChordProfile {
    rootPc: number;
    fifthPc: number; // -1 when the quality has no perfect 5th
    chordPcs: Set<number>;
    essentialPcs: Set<number>;
}

// Perfect 5ths and inner extensions are what guitarists drop first; defining
// tones (root, 3rd or sus note, alt 5ths, 6th/7th, top extension) never are.
function isEssentialInterval(interval: number, intervals: number[]): boolean {
    const highest = intervals[intervals.length - 1];
    switch (interval) {
        case 7: return intervals.length === 3;  // perfect 5th: only triads need it
        case 3:
        case 4: return highest !== 17;          // the 3rd clashes with an 11th on top
        case 14: return highest === 14;         // 9th: defining only in 9th chords
        case 17: return highest === 17;         // 11th: defining only in 11th chords
        default: return true;
    }
}

function buildChordProfile(root: Note, quality: ChordQuality): ChordProfile | null {
    const rootPc = noteToPitchClass(root);
    if (rootPc === -1) return null;

    const intervals = CHORD_INTERVALS[quality];
    const chordPcs = new Set<number>();
    const essentialPcs = new Set<number>();
    for (const interval of intervals) {
        const pc = (rootPc + interval) % 12;
        chordPcs.add(pc);
        if (isEssentialInterval(interval, intervals)) essentialPcs.add(pc);
    }

    return {
        rootPc,
        fifthPc: intervals.includes(7) ? (rootPc + 7) % 12 : -1,
        chordPcs,
        essentialPcs
    };
}

// ---------------------------------------------------------------------------
// Hand model: can four fingers actually hold this grip?
// ---------------------------------------------------------------------------

export interface GripAnalysis {
    fingers: number;  // fretting fingers used (0 = all open strings)
    barre: boolean;   // index barre across the lowest fretted fret
    difficulty: number;
}

// Models the mechanics of a 4-finger fretting hand:
// - at most a 4-fret box (span of 3); wide spans cost extra near the nut
// - an index barre may cover everything from the 1st string down to the
//   lowest string sounding the grip's lowest fret, provided no string under
//   it needs to ring open or stay muted (the barre would sound it)
// - one finger may lie flat across 2-3 adjacent treble strings that share the
//   grip's highest fret (ring/pinky mini-barres, as in x32333 or 3x3455)
// - without a barre, at most 3 fingers can stack on one fret
export function analyzeGrip(frets: number[]): GripAnalysis | null {
    const stringCount = frets.length;
    const fretted: number[] = [];
    for (let s = 0; s < stringCount; s++) {
        if (frets[s] > 0) fretted.push(s);
    }

    if (fretted.length === 0) {
        return { fingers: 0, barre: false, difficulty: 0 };
    }

    let minFret = Infinity;
    let maxFret = 0;
    for (const s of fretted) {
        if (frets[s] < minFret) minFret = frets[s];
        if (frets[s] > maxFret) maxFret = frets[s];
    }
    const span = maxFret - minFret;
    if (span > 3) return null;
    const spanCost = span >= 3
        ? (minFret <= NUT_REGION_END ? WEIGHTS.WIDE_SPAN_LOW : WEIGHTS.WIDE_SPAN_HIGH)
        : 0;

    // Mini-barre: run of adjacent fretted strings on maxFret starting at the
    // most treble fretted string. Open/muted strings on the treble side don't
    // block it (the short flat segment clears them).
    let miniBarreSize = 0;
    if (frets[fretted[0]] === maxFret) {
        let run = 1;
        while (
            run < fretted.length &&
            fretted[run] === fretted[0] + run &&
            frets[fretted[run]] === maxFret
        ) run++;
        if (run >= 2) miniBarreSize = Math.min(run, 3);
    }

    let best: GripAnalysis | null = null;
    const consider = (fingers: number, barre: boolean, miniBarre: boolean) => {
        if (fingers > 4) return;
        const difficulty =
            fingers * WEIGHTS.PER_FINGER +
            (barre ? WEIGHTS.BARRE : 0) +
            (barre && fingers >= 4 ? WEIGHTS.BARRE_FULL_HAND : 0) +
            (miniBarre ? WEIGHTS.MINI_BARRE : 0) +
            spanCost;
        if (!best || difficulty < best.difficulty) {
            best = { fingers, barre, difficulty };
        }
    };

    const isInMiniRun = (frettedIndex: number, active: boolean) =>
        active && frettedIndex < miniBarreSize;

    // Variant 1: no index barre. Every fretted note takes a finger; a
    // mini-barre run shares one.
    {
        const useMini = miniBarreSize > 0;
        const perFret = new Map<number, number>();
        let crowded = false;
        for (let i = 0; i < fretted.length; i++) {
            if (isInMiniRun(i, useMini) && i > 0) continue; // the run is one unit
            const f = frets[fretted[i]];
            const units = (perFret.get(f) || 0) + 1;
            if (units > 3) crowded = true;
            perFret.set(f, units);
        }
        if (!crowded) {
            const fingers = fretted.length - (useMini ? miniBarreSize - 1 : 0);
            consider(fingers, false, useMini);
        }
    }

    // Variant 2: index barre on minFret.
    {
        let barreEnd = -1;
        for (const s of fretted) {
            if (frets[s] === minFret && s > barreEnd) barreEnd = s;
        }
        let valid = true;
        for (let s = 0; s <= barreEnd; s++) {
            if (frets[s] === 0 || frets[s] === -1) { valid = false; break; }
        }
        if (valid) {
            // The mini-barre only helps above the index barre
            const useMini = miniBarreSize > 0 && maxFret > minFret;
            const perFret = new Map<number, number>();
            let aboveUnits = 0;
            let crowded = false;
            for (let i = 0; i < fretted.length; i++) {
                const f = frets[fretted[i]];
                if (f === minFret) continue;
                if (isInMiniRun(i, useMini) && i > 0) continue;
                aboveUnits++;
                const units = (perFret.get(f) || 0) + 1;
                if (units > 3) crowded = true;
                perFret.set(f, units);
            }
            if (!crowded) {
                consider(1 + aboveUnits, true, useMini);
            }
        }
    }

    return best;
}

// ---------------------------------------------------------------------------
// Voicing evaluation: musical filters + idiomatic score
// ---------------------------------------------------------------------------

function evaluateVoicing(
    frets: number[],
    openPcs: number[],
    basePitches: number[],
    profile: ChordProfile
): Voicing | null {
    const stringCount = frets.length;

    let soundedCount = 0;
    let firstSounded = -1;
    let lastSounded = -1;
    let opens = 0;
    let minFret = 0;
    let maxFret = 0;
    let bassPc = -1;
    let bassPitch = Infinity;
    const pcCounts = new Map<number, number>();
    const pitches: number[] = [];

    for (let s = 0; s < stringCount; s++) {
        const f = frets[s];
        if (f < 0) continue;
        soundedCount++;
        if (firstSounded === -1) firstSounded = s;
        lastSounded = s;
        if (f === 0) {
            opens++;
        } else {
            if (minFret === 0 || f < minFret) minFret = f;
            if (f > maxFret) maxFret = f;
        }
        const pc = (openPcs[s] + f) % 12;
        const pitch = basePitches[s] + f;
        pcCounts.set(pc, (pcCounts.get(pc) || 0) + 1);
        pitches.push(pitch);
        // True lowest pitch (not lowest string index) so re-entrant tunings
        // like ukulele high-G resolve the bass correctly.
        if (pitch < bassPitch) {
            bassPitch = pitch;
            bassPc = pc;
        }
    }

    if (soundedCount < 3) return null;

    // Every essential chord tone must sound
    for (const pc of profile.essentialPcs) {
        if (!pcCounts.has(pc)) return null;
    }

    // Doubling limits: no note may exceed half the sounded strings (open E
    // doubles its root twice across 6 strings; a hollow x20402 Bm with three
    // roots in 5 does not), and no color tone may outnumber the root by more
    // than one (x02020 doubles the 5th over a single root and is still the
    // canonical A7).
    const repetitionCap = Math.floor(soundedCount / 2);
    const rootCount = pcCounts.get(profile.rootPc) || 0;
    for (const [pc, count] of pcCounts) {
        if (count > repetitionCap) return null;
        if (pc !== profile.rootPc && count > rootCount + 1) return null;
    }

    // At most one internal muted string (finger-shadow mutes, standard in
    // jazz drop-3 grips); more than that is impractical to strum.
    let internalMutes = 0;
    for (let s = firstSounded; s <= lastSounded; s++) {
        if (frets[s] === -1) internalMutes++;
    }
    if (internalMutes > 1) return null;

    const grip = analyzeGrip(frets);
    if (!grip) return null;

    let score = grip.difficulty;

    if (bassPc === profile.rootPc) score += WEIGHTS.ROOT_BASS;
    else if (bassPc === profile.fifthPc) score += WEIGHTS.FIFTH_BASS;
    else score += WEIGHTS.OTHER_BASS;

    if (opens > 0) {
        score += opens * (maxFret <= OPEN_GRIP_MAX_FRET ? WEIGHTS.OPEN_STRING_LOW : WEIGHTS.OPEN_STRING_HIGH);
    }

    const mutes = stringCount - soundedCount;
    score += mutes * WEIGHTS.MUTED_STRING + internalMutes * WEIGHTS.INTERNAL_MUTE;

    score += minFret * WEIGHTS.PER_START_FRET;

    // Doubled roots/5ths are idiomatic; doubled 3rds/7ths/tensions are not
    for (const [pc, count] of pcCounts) {
        if (count > 1 && pc !== profile.rootPc && pc !== profile.fifthPc) {
            score += (count - 1) * WEIGHTS.DOUBLED_COLOR_TONE;
        }
    }

    // Low interval limit: close intervals below ~B2 sound muddy
    pitches.sort((a, b) => a - b);
    for (let i = 1; i < pitches.length; i++) {
        if (pitches[i] - pitches[i - 1] <= 4 && pitches[i - 1] < MUDDY_PITCH_CEILING) {
            score += WEIGHTS.MUDDY_INTERVAL;
        }
    }

    return { frets: [...frets], startFret: minFret, score };
}

// ---------------------------------------------------------------------------
// Generation: sliding 4-fret windows + open strings, pruned DFS
// ---------------------------------------------------------------------------

export function getChordVoicings(
    instrument: Instrument,
    tuningOffsets: number[],
    stringCount: number,
    root: Note,
    quality: ChordQuality,
    maxFrets: number = 18,
    limit: number = 10
): Voicing[] {
    const profile = buildChordProfile(root, quality);
    if (!profile) return [];

    const config = getInstrumentConfig(instrument, stringCount);
    const strings = config.strings;

    const openPcs: number[] = [];
    const basePitches: number[] = [];
    for (let s = 0; s < strings; s++) {
        const offset = tuningOffsets[s] ?? 0;
        openPcs.push(((config.defaultTuning[s] + offset) % 12 + 12) % 12);
        basePitches.push(config.baseSemitones[s] + offset);
    }

    const unique = new Map<string, Voicing>();
    const record = (v: Voicing) => {
        const key = v.frets.join(',');
        const existing = unique.get(key);
        if (!existing || v.score < existing.score) unique.set(key, v);
    };

    const current = new Array(strings).fill(-1);

    for (let windowStart = 1; windowStart <= Math.max(1, maxFrets - 3); windowStart++) {
        const windowEnd = Math.min(windowStart + 3, maxFrets);

        const choices: number[][] = [];
        for (let s = 0; s < strings; s++) {
            const stringChoices = [-1]; // -1 = muted string
            if (profile.chordPcs.has(openPcs[s])) stringChoices.push(0);
            for (let f = windowStart; f <= windowEnd; f++) {
                if (profile.chordPcs.has((openPcs[s] + f) % 12)) stringChoices.push(f);
            }
            choices.push(stringChoices);
        }

        // Union of chord tones reachable from string s onward, for pruning
        const suffixPcs: Set<number>[] = new Array(strings + 1);
        suffixPcs[strings] = new Set();
        for (let s = strings - 1; s >= 0; s--) {
            const set = new Set(suffixPcs[s + 1]);
            for (const f of choices[s]) {
                if (f >= 0) set.add((openPcs[s] + f) % 12);
            }
            suffixPcs[s] = set;
        }

        const covered = new Map<number, number>();

        // DFS over string choices. Prunes branches that can no longer reach a
        // missing essential tone or already carry two internal mutes.
        const walk = (s: number, sounded: number, pendingMutes: number, internalMutes: number) => {
            if (s === strings) {
                const v = evaluateVoicing(current, openPcs, basePitches, profile);
                if (v) record(v);
                return;
            }
            for (const pc of profile.essentialPcs) {
                if (!covered.has(pc) && !suffixPcs[s].has(pc)) return;
            }
            for (const f of choices[s]) {
                if (f === -1) {
                    current[s] = -1;
                    walk(s + 1, sounded, sounded > 0 ? pendingMutes + 1 : 0, internalMutes);
                    continue;
                }
                const nextInternal = internalMutes + (sounded > 0 ? pendingMutes : 0);
                if (nextInternal > 1) continue;
                const pc = (openPcs[s] + f) % 12;
                covered.set(pc, (covered.get(pc) || 0) + 1);
                current[s] = f;
                walk(s + 1, sounded + 1, 0, nextInternal);
                const count = covered.get(pc)!;
                if (count === 1) covered.delete(pc);
                else covered.set(pc, count - 1);
            }
            current[s] = -1;
        };
        walk(0, 0, 0, 0);
    }

    const ranked = Array.from(unique.values()).sort((a, b) =>
        a.score - b.score ||
        a.startFret - b.startFret ||
        a.frets.join(',').localeCompare(b.frets.join(','))
    );

    // Keep the best-scored grips but spread picks across neck positions so a
    // burst of near-identical low grips doesn't crowd out the barre shapes.
    const positionCap = Math.max(3, Math.ceil(limit / 3));
    const perPosition = new Map<number, number>();
    const picked: Voicing[] = [];
    for (const v of ranked) {
        const used = perPosition.get(v.startFret) || 0;
        if (used >= positionCap) continue;
        perPosition.set(v.startFret, used + 1);
        picked.push(v);
        if (picked.length >= limit) break;
    }

    return picked.sort((a, b) => a.startFret - b.startFret || a.score - b.score);
}
