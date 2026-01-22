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

interface InstrumentConfig {
    name: string;
    strings: number;
    tuning: number[]; // Indices in CHROMATIC_SCALE
    baseSemitones: number[]; // Semitones from C0
    inlayCenterStringIndex: number; // String index to anchor center inlays
}

export const INSTRUMENT_CONFIGS: Record<Instrument, InstrumentConfig> = {
    GUITAR: {
        name: 'Guitar',
        strings: 6,
        tuning: [4, 9, 2, 7, 11, 4], // E, A, D, G, B, E
        baseSemitones: [28, 33, 38, 43, 47, 52], // E2-E4
        inlayCenterStringIndex: 3 // G string (index 3 from bottom 0)
    },
    BASS: {
        name: 'Bass',
        strings: 4,
        tuning: [4, 9, 2, 7], // E, A, D, G
        baseSemitones: [16, 21, 26, 31], // E1-G2
        inlayCenterStringIndex: 2 // D string (index 2 from bottom 0)
    }
};

/**
 * Returns the note at a specific string (0-based index) and fret (0-based index).
 */
export const getNoteAtPosition = (instrument: Instrument, stringIndex: number, fretIndex: number): Note => {
    const config = INSTRUMENT_CONFIGS[instrument];
    const openStringNoteIndex = config.tuning[stringIndex];
    const chromaticIndex = (openStringNoteIndex + fretIndex) % 12;
    return CHROMATIC_SCALE[chromaticIndex];
};

/**
 * Returns the octave for a specific string and fret.
 */
export const getOctave = (instrument: Instrument, stringIndex: number, fretIndex: number): number => {
    const config = INSTRUMENT_CONFIGS[instrument];
    const totalSemitones = config.baseSemitones[stringIndex] + fretIndex;
    return Math.floor(totalSemitones / 12);
};
