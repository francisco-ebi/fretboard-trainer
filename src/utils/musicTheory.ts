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
    MAJOR: [0, 2, 4, 5, 7, 9, 11], // Ionian: Root, Major 2nd, Major 3rd, Perfect 4th, Perfect 5th, Major 6th, Major 7th
    MINOR: [0, 2, 3, 5, 7, 8, 10], // Aeolian/Natural Minor: Root, Maj 2nd, Min 3rd, Perf 4th, Perf 5th, Min 6th, Min 7th
    PENTATONIC_MAJOR: [0, 2, 4, 7, 9], // Root, Maj 2nd, Maj 3rd, Perf 5th, Maj 6th
    PENTATONIC_MINOR: [0, 3, 5, 7, 10], // Root, Min 3rd, Perf 4th, Perf 5th, Min 7th
    BLUES: [0, 3, 5, 6, 7, 10], // Root, Min 3rd, Perf 4th, Dim 5th, Perf 5th, Min 7th

    // Church Modes
    IONIAN: [0, 2, 4, 5, 7, 9, 11], // Same as Major
    DORIAN: [0, 2, 3, 5, 7, 9, 10], // Mode 2 (Minor with natural 6)
    PHRYGIAN: [0, 1, 3, 5, 7, 8, 10], // Mode 3 (Minor with flat 2)
    LYDIAN: [0, 2, 4, 6, 7, 9, 11], // Mode 4 (Major with sharp 4)
    MIXOLYDIAN: [0, 2, 4, 5, 7, 9, 10], // Mode 5 (Major with flat 7)
    AEOLIAN: [0, 2, 3, 5, 7, 8, 10], // Mode 6 (Same as Natural Minor)
    LOCRIAN: [0, 1, 3, 5, 6, 8, 10]  // Mode 7 (Diminished)
};

export type ScaleType = keyof typeof SCALES;

// Characteristic intervals (the flavor notes) for the Church Modes
export const CHARACTERISTIC_INTERVALS: Partial<Record<ScaleType, string>> = {
    DORIAN: '6', // Major 6th in a minor context
    PHRYGIAN: 'b2', // Minor 2nd
    LYDIAN: 'b5', // Augmented 4th (mapped to b5 physically)
    MIXOLYDIAN: 'b7', // Minor 7th in a major context
    AEOLIAN: 'b6', // Minor 6th
    LOCRIAN: 'b5' // Diminished 5th
};

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
        defaultTuning: [4, 11, 7, 2, 9, 4], // E, B, G, D, A, E (High to Low)
        baseSemitones: [52, 47, 43, 38, 33, 28], // E4, B3, G3, D3, A2, E2
        inlayCenterStringIndex: 2 // G string is index 2 (from top 0)
    },
    BASS: {
        name: 'Bass',
        strings: 4,
        defaultTuning: [7, 2, 9, 4], // G, D, A, E (High to Low)
        baseSemitones: [31, 26, 21, 16], // G2, D2, A1, E1
        inlayCenterStringIndex: 1 // D string is index 1 (from top 0)
    }
};

// Extended configurations for multi-string guitars
export const GUITAR_CONFIGS: Record<number, InstrumentConfig> = {
    6: INSTRUMENT_CONFIGS.GUITAR,
    7: {
        name: 'Guitar (7-String)',
        strings: 7,
        defaultTuning: [4, 11, 7, 2, 9, 4, 11], // E, B, G, D, A, E, B (High to Low)
        baseSemitones: [52, 47, 43, 38, 33, 28, 23], // E4 down to B1
        inlayCenterStringIndex: 3 // D string is index 3
    },
    8: {
        name: 'Guitar (8-String)',
        strings: 8,
        defaultTuning: [4, 11, 7, 2, 9, 4, 11, 6], // E, B, G, D, A, E, B, F# (High to Low)
        baseSemitones: [52, 47, 43, 38, 33, 28, 23, 18], // E4 down to F#1
        inlayCenterStringIndex: 3 // D string is still a decent center visual
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
    DROP_D: { name: 'Drop D', offsets: [0, 0, 0, 0, 0, -2] }, // Drop Low E (Last string)
    OPEN_G: { name: 'Open G', offsets: [-2, 0, 0, 0, -2, -2] }, // D B G D G D (High to Low) -> Original High E to D (-2), Low E to D (-2), A to G (-2)
    DADGAD: { name: 'DADGAD', offsets: [-2, -2, 0, 0, 0, -2] }, // D A G D A D (High to Low) -> High E to D (-2), B to A (-2), Low E to D (-2)
    HALF_STEP_DOWN: { name: 'Half Step Down', offsets: [-1, -1, -1, -1, -1, -1] }
};

export const GUITAR_TUNINGS_7: Record<string, Tuning> = {
    STANDARD: { name: 'Standard (EBGDAEB)', offsets: [0, 0, 0, 0, 0, 0, 0] },
    DROP_A: { name: 'Drop A (EBGDAEA)', offsets: [0, 0, 0, 0, 0, 0, -2] }, // Drop Low B (Index 6)
    HALF_STEP_DOWN: { name: 'Half Step Down', offsets: [-1, -1, -1, -1, -1, -1, -1] }
};

export const GUITAR_TUNINGS_8: Record<string, Tuning> = {
    STANDARD: { name: 'Standard (EBGDAEBF#)', offsets: [0, 0, 0, 0, 0, 0, 0, 0] },
    DROP_E: { name: 'Drop E (EBGDAEBE)', offsets: [0, 0, 0, 0, 0, 0, 0, -2] }, // Drop Low F#
    HALF_STEP_DOWN: { name: 'Half Step Down', offsets: [-1, -1, -1, -1, -1, -1, -1, -1] }
};

// Chord Theory

export type ChordQuality = 'MAJOR' | 'MINOR' | 'DIMINISHED' | 'SUS2' | 'SUS4' | 'ADD9' | 'DOM7' | 'MAJ7';

export interface ChordInfo {
    root: Note;
    quality: ChordQuality;
    notes: Note[];
    displayName: string;
    romanNumeral: string;
}

// Intervals for chord construction (Root, 3rd, 5th)
const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
    MAJOR: [0, 4, 7],
    MINOR: [0, 3, 7],
    DIMINISHED: [0, 3, 6],
    SUS2: [0, 2, 7],
    SUS4: [0, 5, 7],
    ADD9: [0, 4, 7, 14],
    DOM7: [0, 4, 7, 10],
    MAJ7: [0, 4, 7, 11]
};

// Diatonic patterns
const DIATONIC_PATTERNS: Record<'MAJOR' | 'MINOR', { quality: ChordQuality, roman: string }[]> = {
    MAJOR: [
        { quality: 'MAJOR', roman: 'I' },
        { quality: 'MINOR', roman: 'ii' },
        { quality: 'MINOR', roman: 'iii' },
        { quality: 'MAJOR', roman: 'IV' },
        { quality: 'MAJOR', roman: 'V' },
        { quality: 'MINOR', roman: 'vi' },
        { quality: 'DIMINISHED', roman: 'vii°' }
    ],
    MINOR: [
        { quality: 'MINOR', roman: 'i' },
        { quality: 'DIMINISHED', roman: 'ii°' },
        { quality: 'MAJOR', roman: 'III' },
        { quality: 'MINOR', roman: 'iv' },
        { quality: 'MINOR', roman: 'v' },
        { quality: 'MAJOR', roman: 'VI' },
        { quality: 'MAJOR', roman: 'VII' }
    ]
};

export const getChordNotes = (root: Note, quality: ChordQuality): Note[] => {
    const rotatedChromatic = getRotatedScale(root);
    return CHORD_INTERVALS[quality].map(interval => rotatedChromatic[interval]);
};

export const getDiatonicChords = (keyRoot: Note, scaleType: 'MAJOR' | 'MINOR'): ChordInfo[] => {
    const scaleNotes = getScale(keyRoot, scaleType);
    const pattern = DIATONIC_PATTERNS[scaleType];

    return scaleNotes.map((note, index) => {
        const { quality, roman } = pattern[index];
        const notes = getChordNotes(note, quality);

        let suffix = '';
        if (quality === 'MINOR') suffix = 'm';
        if (quality === 'DIMINISHED') suffix = '°';

        return {
            root: note,
            quality,
            notes,
            displayName: `${note}${suffix}`,
            romanNumeral: roman
        };
    });
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
