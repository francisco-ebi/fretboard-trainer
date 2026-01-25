export type Note = string;
export type NamingSystem = 'ENGLISH' | 'SOLFEGE';

const SOLFEGE_MAP: Record<string, string> = {
    'C': 'Do', 'C#': 'Do#',
    'D': 'Re', 'D#': 'Re#',
    'E': 'Mi',
    'F': 'Fa', 'F#': 'Fa#',
    'G': 'Sol', 'G#': 'Sol#',
    'A': 'La', 'A#': 'La#',
    'B': 'Si'
};

const INTERVAL_NAMES: Record<number, string> = {
    0: '1',
    1: 'b2', 2: '2',
    3: 'b3', 4: '3',
    5: '4',
    6: 'b5', 7: '5',
    8: 'b6', 9: '6',
    10: 'b7', 11: '7'
};

export const getNoteName = (note: Note, system: NamingSystem): string => {
    if (system === 'ENGLISH') return note;
    return SOLFEGE_MAP[note] || note;
};

export const getInterval = (root: Note, note: Note): string => {
    const rootIndex = CHROMATIC_SCALE.indexOf(root);
    const noteIndex = CHROMATIC_SCALE.indexOf(note);

    if (rootIndex === -1 || noteIndex === -1) return '?';

    let semitones = noteIndex - rootIndex;
    if (semitones < 0) semitones += 12;

    return INTERVAL_NAMES[semitones] || '?';
};

export const CHROMATIC_SCALE: Note[] = [
    'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
];

export const SCALES = {
    MAJOR: [0, 2, 4, 5, 7, 9, 11], // Intervals from root: Root, Major 2nd, Major 3rd, Perfect 4th, Perfect 5th, Major 6th, Major 7th
    MINOR: [0, 2, 3, 5, 7, 8, 10], // Natural Minor: Root, Maj 2nd, Min 3rd, Perf 4th, Perf 5th, Min 6th, Min 7th
    PENTATONIC_MAJOR: [0, 2, 4, 7, 9], // Root, Maj 2nd, Maj 3rd, Perf 5th, Maj 6th
    PENTATONIC_MINOR: [0, 3, 5, 7, 10], // Root, Min 3rd, Perf 4th, Perf 5th, Min 7th
    BLUES: [0, 3, 5, 6, 7, 10] // Root, Min 3rd, Perf 4th, Dim 5th, Perf 5th, Min 7th
};

export type ScaleType = keyof typeof SCALES;

/**
 * Rotates the chromatic scale so it starts with the given root note.
 */
const getRotatedScale = (root: Note): Note[] => {
    const rootIndex = CHROMATIC_SCALE.indexOf(root);
    if (rootIndex === -1) {
        throw new Error(`Invalid root note: ${root}`);
    }
    return [
        ...CHROMATIC_SCALE.slice(rootIndex),
        ...CHROMATIC_SCALE.slice(0, rootIndex)
    ];
};

/**
 * Returns the notes in the scale for a given root note and scale intervals.
 */
export const getScale = (root: Note, scaleType: ScaleType = 'MAJOR'): Note[] => {
    const rotatedChromatic = getRotatedScale(root);
    const intervals = SCALES[scaleType];
    return intervals.map(interval => rotatedChromatic[interval]);
};

// Instrument Configuration
export type Instrument = 'GUITAR' | 'BASS';

export interface Tuning {
    name: string;
    offsets: number[]; // Semitones relative to standard tuning (0 = no change)
}

export interface InstrumentConfig {
    name: string;
    strings: number;
    defaultTuning: number[]; // Indices in CHROMATIC_SCALE (Standard Tuning)
    baseSemitones: number[]; // Semitones from C0 (Standard Tuning Reference)
    inlayCenterStringIndex: number; // String index to anchor center inlays
}

// Base configurations (Defaults)
export const INSTRUMENT_CONFIGS: Record<Instrument, InstrumentConfig> = {
    GUITAR: {
        name: 'Guitar (6-String)',
        strings: 6,
        defaultTuning: [4, 9, 2, 7, 11, 4], // E, A, D, G, B, E
        baseSemitones: [28, 33, 38, 43, 47, 52], // E2-E4
        inlayCenterStringIndex: 3 // G string (index 3 from bottom 0)
    },
    BASS: {
        name: 'Bass',
        strings: 4,
        defaultTuning: [4, 9, 2, 7], // E, A, D, G
        baseSemitones: [16, 21, 26, 31], // E1-G2
        inlayCenterStringIndex: 2 // D string (index 2 from bottom 0)
    }
};

// Extended configurations for multi-string guitars
export const GUITAR_CONFIGS: Record<number, InstrumentConfig> = {
    6: INSTRUMENT_CONFIGS.GUITAR,
    7: {
        name: 'Guitar (7-String)',
        strings: 7,
        defaultTuning: [11, 4, 9, 2, 7, 11, 4], // B, E, A, D, G, B, E
        baseSemitones: [23, 28, 33, 38, 43, 47, 52], // B1-E4
        inlayCenterStringIndex: 3 // D string (index 3 from bottom 0, which is middle of 7)
        // Note on center index: 7 strings 0..6. Middle is 3.
    },
    8: {
        name: 'Guitar (8-String)',
        strings: 8,
        defaultTuning: [6, 11, 4, 9, 2, 7, 11, 4], // F#, B, E, A, D, G, B, E
        baseSemitones: [18, 23, 28, 33, 38, 43, 47, 52], // F#1-E4
        inlayCenterStringIndex: 4 // A string (index 4 from bottom 0)
        // 8 strings 0..7. 3.5 is middle. 4 is the 5th string (A).
        // Let's stick with specific string indices for visuals.
    }
};

export const getInstrumentConfig = (instrument: Instrument, stringCount?: number): InstrumentConfig => {
    if (instrument === 'GUITAR' && stringCount && GUITAR_CONFIGS[stringCount]) {
        return GUITAR_CONFIGS[stringCount];
    }
    return INSTRUMENT_CONFIGS[instrument];
};

export const GUITAR_TUNINGS: Record<string, Tuning> = {
    STANDARD: { name: 'Standard', offsets: [0, 0, 0, 0, 0, 0] },
    DROP_D: { name: 'Drop D', offsets: [-2, 0, 0, 0, 0, 0] },
    OPEN_G: { name: 'Open G', offsets: [-2, -2, 0, 0, 0, -2] }, // D G D G B D
    DADGAD: { name: 'DADGAD', offsets: [-2, 0, 0, 0, -2, -2] }, // D A D G A D
    HALF_STEP_DOWN: { name: 'Half Step Down', offsets: [-1, -1, -1, -1, -1, -1] }
};

export const GUITAR_TUNINGS_7: Record<string, Tuning> = {
    STANDARD: { name: 'Standard (BEADGBE)', offsets: [0, 0, 0, 0, 0, 0, 0] },
    DROP_A: { name: 'Drop A (AEADGBE)', offsets: [-2, 0, 0, 0, 0, 0, 0] },
    HALF_STEP_DOWN: { name: 'Half Step Down', offsets: [-1, -1, -1, -1, -1, -1, -1] }
};

export const GUITAR_TUNINGS_8: Record<string, Tuning> = {
    STANDARD: { name: 'Standard (F#BEADGBE)', offsets: [0, 0, 0, 0, 0, 0, 0, 0] },
    DROP_E: { name: 'Drop E (EBEADGBE)', offsets: [-2, 0, 0, 0, 0, 0, 0, 0] },
    HALF_STEP_DOWN: { name: 'Half Step Down', offsets: [-1, -1, -1, -1, -1, -1, -1, -1] }
};

/**
 * Returns the note at a specific string (0-based index) and fret (0-based index).
 * Takes an optional tuningOffset array to adjust the open string notes.
 */
export const getNoteAtPosition = (instrument: Instrument, stringIndex: number, fretIndex: number, tuningOffsets?: number[], stringCount?: number): Note => {
    const config = getInstrumentConfig(instrument, stringCount);
    // Safety check for string index
    if (stringIndex >= config.strings) return 'C';

    const openStringNoteIndex = config.defaultTuning[stringIndex];

    let offset = 0;
    if (tuningOffsets && tuningOffsets[stringIndex] !== undefined) {
        offset = tuningOffsets[stringIndex];
    }

    // Ensure positive index for modulo
    const chromaticIndex = (openStringNoteIndex + fretIndex + offset + 120) % 12; // +120 safely handles negative offsets
    return CHROMATIC_SCALE[chromaticIndex];
};

/**
 * Returns the octave for a specific string and fret.
 * Takes an optional tuningOffset array to adjust the pitch.
 */
export const getOctave = (instrument: Instrument, stringIndex: number, fretIndex: number, tuningOffsets?: number[], stringCount?: number): number => {
    const config = getInstrumentConfig(instrument, stringCount);
    if (stringIndex >= config.strings) return 0;

    let totalSemitones = config.baseSemitones[stringIndex] + fretIndex;

    if (tuningOffsets && tuningOffsets[stringIndex] !== undefined) {
        totalSemitones += tuningOffsets[stringIndex];
    }

    return Math.floor(totalSemitones / 12);
};
