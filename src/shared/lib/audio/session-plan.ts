// Guided-session plan generation: encodes the recording protocol's coverage
// map and variation grid (docs/recording-protocol.md §3) as data the session
// runner walks. Pure module — must not import the engine (worker URLs).

export type PlanPreset = 'passA' | 'passB' | 'full' | 'single';
export type Dynamics = 'soft' | 'medium' | 'hard';
export type Excitation = 'pick' | 'finger';
export type PluckPosition = 'bridge' | 'middle' | 'neck';

export interface PluckSpec {
    dynamics: Dynamics;
    excitation: Excitation;
    position: PluckPosition;
}

export interface FretTask {
    fret: number;
    midi: number;
    noteName: string;
    zone: 'overlap' | 'unique';
    plucks: PluckSpec[];
}

export interface StringTask {
    stringIndex: number;
    stringLabel: string;
    openMidi: number;
    frets: FretTask[];
}

export interface SessionPlan {
    preset: PlanPreset;
    strings: StringTask[];
    totalPlucks: number;
}

export interface PlanOptions {
    preset: PlanPreset;
    stringIndex?: number; // 'single' only
    fretStart?: number; // 'single' only, default 0
    fretEnd?: number; // 'single' only, default MAX_FRET
}

// Must stay equal to STRING_MIDI_RANGES[n].min (recording-engine.ts) and
// baseNotes (prediction-engine.ts) — pinned by session-plan.test.ts.
export const OPEN_STRING_MIDI: Record<number, number> = { 0: 64, 1: 59, 2: 55, 3: 50, 4: 45, 5: 40 };
export const STRING_LABELS: Record<number, string> = { 0: 'high E', 1: 'B', 2: 'G', 3: 'D', 4: 'A', 5: 'low E' };
export const MAX_FRET = 18; // the capture filter accepts frets 0–18 (protocol §3.1)

export const PLUCK_POSITION_LABELS: Record<PluckPosition, string> = {
    bridge: 'near bridge',
    middle: 'middle',
    neck: 'near neck'
};

// Plain (unwound) strings decay fast: ~6–7 sequences per pluck vs ~9–12 on
// wound strings (measured on the v1 dataset), so an equal-pluck plan lands
// ~2× unbalanced against the ≤1.5× class-balance target. These strings get a
// ×1.5 pluck allowance (protocol §3.2). Sets with a plain G need a manual
// top-up for string 2 — string construction isn't knowable from here.
export const PLAIN_STRINGS: number[] = [0, 1]; // high E, B

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteName(midi: number): string {
    return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

// Overlap zone = pitches that exist on at least one other string — priority
// coverage; unique zone gets light coverage (protocol §3.1).
export function zoneOf(stringIndex: number, fret: number): 'overlap' | 'unique' {
    if (stringIndex === 5) return fret >= 5 ? 'overlap' : 'unique';
    if (stringIndex === 0) return fret <= 13 ? 'overlap' : 'unique';
    return 'overlap';
}

const DYNAMICS: Dynamics[] = ['soft', 'medium', 'hard'];
const EXCITATIONS: Excitation[] = ['pick', 'finger'];
const POSITIONS: PluckPosition[] = ['bridge', 'middle', 'neck'];

const clampFret = (fret: number) => Math.min(MAX_FRET, Math.max(0, Math.round(fret)));

export function generateSessionPlan(options: PlanOptions): SessionPlan {
    let stringOrder: number[];
    let fretStart: number;
    let fretEnd: number;

    switch (options.preset) {
        case 'passA': // protocol §3.4: strings 5→0, frets 0–9
            stringOrder = [5, 4, 3, 2, 1, 0];
            fretStart = 0;
            fretEnd = 9;
            break;
        case 'passB': // strings 0→5, frets 10–18
            stringOrder = [0, 1, 2, 3, 4, 5];
            fretStart = 10;
            fretEnd = MAX_FRET;
            break;
        case 'full':
            stringOrder = [5, 4, 3, 2, 1, 0];
            fretStart = 0;
            fretEnd = MAX_FRET;
            break;
        case 'single': {
            const stringIndex = options.stringIndex ?? 5;
            if (!(stringIndex in OPEN_STRING_MIDI)) throw new Error(`Invalid string index: ${stringIndex}`);
            stringOrder = [stringIndex];
            fretStart = clampFret(options.fretStart ?? 0);
            fretEnd = clampFret(options.fretEnd ?? MAX_FRET);
            if (fretStart > fretEnd) throw new Error(`Empty fret range: ${fretStart}–${fretEnd}`);
            break;
        }
    }

    // One position cursor runs across the whole plan, bumped by 2 between
    // frets, so the position↔dynamics alignment rotates for both fret sizes
    // (6 plucks ≡ 0 and 2 plucks ≡ 2 mod 3 would otherwise pin it).
    let positionCursor = 0;
    const nextPosition = () => POSITIONS[positionCursor++ % POSITIONS.length];

    const strings: StringTask[] = stringOrder.map((stringIndex) => {
        const openMidi = OPEN_STRING_MIDI[stringIndex];
        const frets: FretTask[] = [];
        for (let fret = fretStart; fret <= fretEnd; fret++) {
            const zone = zoneOf(stringIndex, fret);
            const plain = PLAIN_STRINGS.includes(stringIndex);
            const plucks: PluckSpec[] = [];
            if (zone === 'overlap') {
                // Compressed grid (protocol §3.2): {soft,medium,hard} × {pick,finger}
                for (const excitation of EXCITATIONS) {
                    for (const dynamics of DYNAMICS) {
                        plucks.push({ dynamics, excitation, position: nextPosition() });
                    }
                }
                if (plain) {
                    // ×1.5 allowance: one extra dynamics sweep, alternating
                    // excitation by fret so neither ends up over-represented
                    const extras: Excitation[] = fret % 2 === 0 ? ['pick', 'finger', 'pick'] : ['finger', 'pick', 'finger'];
                    DYNAMICS.forEach((dynamics, index) => {
                        plucks.push({ dynamics, excitation: extras[index], position: nextPosition() });
                    });
                }
            } else {
                // Unique zone: medium × {pick,finger}
                for (const excitation of EXCITATIONS) {
                    plucks.push({ dynamics: 'medium', excitation, position: nextPosition() });
                }
                if (plain) {
                    plucks.push({ dynamics: 'medium', excitation: fret % 2 === 0 ? 'pick' : 'finger', position: nextPosition() });
                }
            }
            positionCursor += 2;
            frets.push({ fret, midi: openMidi + fret, noteName: midiToNoteName(openMidi + fret), zone, plucks });
        }
        return { stringIndex, stringLabel: STRING_LABELS[stringIndex], openMidi, frets };
    });

    const totalPlucks = strings.reduce(
        (sum, s) => sum + s.frets.reduce((acc, f) => acc + f.plucks.length, 0),
        0
    );

    return { preset: options.preset, strings, totalPlucks };
}
