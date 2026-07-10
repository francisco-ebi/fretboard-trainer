export type Note = string;
export type NamingSystem = 'ENGLISH' | 'SOLFEGE';

const SOLFEGE_MAP: Record<string, string> = {
    'C': 'Do', 'C#': 'Do#', 'Cb': 'Dob',
    'D': 'Re', 'D#': 'Re#', 'Db': 'Reb',
    'E': 'Mi', 'E#': 'Mi#', 'Eb': 'Mib',
    'F': 'Fa', 'F#': 'Fa#', 'Fb': 'Fab',
    'G': 'Sol', 'G#': 'Sol#', 'Gb': 'Solb',
    'A': 'La', 'A#': 'La#', 'Ab': 'Lab',
    'B': 'Si', 'B#': 'Si#', 'Bb': 'Sib'
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
    const rootIndex = getNoteIndex(root);
    const noteIndex = getNoteIndex(note);

    if (rootIndex === -1 || noteIndex === -1) return '?';

    let semitones = noteIndex - rootIndex;
    if (semitones < 0) semitones += 12;

    return INTERVAL_NAMES[semitones] || '?';
};

export const DETAILED_INTERVAL_KEYS: Record<number, string> = {
    0: 'unison',
    1: 'min2', 2: 'maj2',
    3: 'min3', 4: 'maj3',
    5: 'perf4',
    6: 'tritone', 7: 'perf5',
    8: 'min6', 9: 'maj6',
    10: 'min7', 11: 'maj7',
    12: 'octave',
    13: 'min9', 14: 'maj9',
    15: 'min10', 16: 'maj10',
    17: 'perf11',
    18: 'aug11', 19: 'perf12',
    20: 'min13', 21: 'maj13',
    22: 'min14', 23: 'maj14'
};

export const getDetailedInterval = (note1: Note, octave1: number, note2: Note, octave2: number): { key: string, octaves: number } | null => {
    const index1 = getNoteIndex(note1);
    const index2 = getNoteIndex(note2);

    if (index1 === -1 || index2 === -1) return null;

    const absolutePitch1 = octave1 * 12 + index1;
    const absolutePitch2 = octave2 * 12 + index2;

    const semitones = Math.abs(absolutePitch2 - absolutePitch1);

    if (DETAILED_INTERVAL_KEYS[semitones]) {
        return { key: DETAILED_INTERVAL_KEYS[semitones], octaves: 0 };
    }
    
    // For larger intervals, simplify
    const octaves = Math.floor(semitones / 12);
    const remainder = semitones % 12;
    const baseKey = DETAILED_INTERVAL_KEYS[remainder];
    
    return { key: baseKey, octaves };
};

export const SHARPS_SCALE: Note[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLATS_SCALE: Note[] = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const CHROMATIC_SCALE = SHARPS_SCALE;
export const ROOT_NOTES: Note[] = [
    'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'E#', 'Fb', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B', 'B#', 'Cb'
];

export const getNoteIndex = (note: Note): number => {
    // Handle enharmonics that are not in the standard arrays
    if (note === 'Cb') return 11; // B
    if (note === 'Fb') return 4;  // E
    if (note === 'E#') return 5;  // F
    if (note === 'B#') return 0;  // C

    let index = SHARPS_SCALE.indexOf(note);
    if (index === -1) index = FLATS_SCALE.indexOf(note);
    return index;
};

export const areEnharmonicallyEquivalent = (note1: Note, note2: Note): boolean => {
    const index1 = getNoteIndex(note1);
    const index2 = getNoteIndex(note2);
    // Be sure they are strictly valid pitches
    if (index1 === -1 || index2 === -1) return false;
    return index1 === index2;
};

export const getNoteDisplayLabel = (note: Note): string => {
    const index = SHARPS_SCALE.indexOf(note);
    if (index === -1) return note; // fallback

    const flatEquivalent = FLATS_SCALE[index];
    if (note !== flatEquivalent) {
        return `${note} / ${flatEquivalent}`;
    }
    return note;
};

// --- Diatonic spelling logic ---
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PITCH_CLASSES: Record<string, number> = {
    'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
};

export const SCALE_DEGREES: Record<ScaleType, number[]> = {
    MAJOR: [0, 1, 2, 3, 4, 5, 6],
    MINOR: [0, 1, 2, 3, 4, 5, 6],
    PENTATONIC_MAJOR: [0, 1, 2, 4, 5],
    PENTATONIC_MINOR: [0, 2, 3, 4, 6],
    BLUES: [0, 2, 3, 3, 4, 6], // Blues has a chromatic passing tone, we assign the #4/b5 to the 4th degree ideally, but this is a rough mapping.
    IONIAN: [0, 1, 2, 3, 4, 5, 6],
    DORIAN: [0, 1, 2, 3, 4, 5, 6],
    PHRYGIAN: [0, 1, 2, 3, 4, 5, 6],
    LYDIAN: [0, 1, 2, 3, 4, 5, 6],
    MIXOLYDIAN: [0, 1, 2, 3, 4, 5, 6],
    AEOLIAN: [0, 1, 2, 3, 4, 5, 6],
    LOCRIAN: [0, 1, 2, 3, 4, 5, 6],
    DOUBLE_HARMONIC: [0, 1, 2, 3, 4, 5, 6],
    HUNGARIAN_MINOR: [0, 1, 2, 3, 4, 5, 6],
    NEAPOLITAN_MINOR: [0, 1, 2, 3, 4, 5, 6],
    NEAPOLITAN_MAJOR: [0, 1, 2, 3, 4, 5, 6],
    HARMONIC_MINOR: [0, 1, 2, 3, 4, 5, 6],
    MELODIC_MINOR: [0, 1, 2, 3, 4, 5, 6],
    DOUBLE_HARMONIC_PENTATONIC: [0, 1, 2, 4, 5],
    DOUBLE_HARMONIC_HEXATONIC_M2: [0, 1, 1, 2, 4, 5], // 1, b2, 2, 3, 5, b6
    DOUBLE_HARMONIC_HEXATONIC_AUG4: [0, 1, 2, 3, 4, 5] // 1, b2, 3, #4, 5, b6
};

export const getProperSpelling = (root: Note, targetPitchClass: number, degreeIndex: number): Note => {
    // 1. Determine the target letter name based on the root letter and diatonic degree index.
    const rootLetter = root.charAt(0);
    const rootLetterIndex = LETTERS.indexOf(rootLetter);
    if (rootLetterIndex === -1) return SHARPS_SCALE[targetPitchClass]; // Fallback

    const targetLetter = LETTERS[(rootLetterIndex + degreeIndex) % 7];
    const targetLetterBasePitch = LETTER_PITCH_CLASSES[targetLetter];

    // 2. Calculate the difference in semitones between the base letter pitch and the target pitch.
    let diff = targetPitchClass - targetLetterBasePitch;
    
    // Adjust for octave wrapping
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;

    // 3. Construct the note with the correct accidentals
    if (diff === 0) return targetLetter;
    if (diff === 1) return `${targetLetter}#`;
    if (diff === 2) return `${targetLetter}x`; // Double sharp
    if (diff === -1) return `${targetLetter}b`;
    if (diff === -2) return `${targetLetter}bb`; // Double flat

    // Fallback if the difference is extreme (should not happen in standard diatonic theory)
    return FLATS_SCALE[targetPitchClass]; 
};
// ------------------------------


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
    LOCRIAN: [0, 1, 3, 5, 6, 8, 10],  // Mode 7 (Diminished)

    // Exotic Scales
    DOUBLE_HARMONIC: [0, 1, 4, 5, 7, 8, 11],
    HUNGARIAN_MINOR: [0, 2, 3, 6, 7, 8, 11],
    NEAPOLITAN_MINOR: [0, 1, 3, 5, 7, 8, 11],
    NEAPOLITAN_MAJOR: [0, 1, 3, 5, 7, 9, 11],
    
    // Technical Minors
    HARMONIC_MINOR: [0, 2, 3, 5, 7, 8, 11], // 1, 2, b3, 4, 5, b6, 7
    MELODIC_MINOR: [0, 2, 3, 5, 7, 9, 11],   // 1, 2, b3, 4, 5, 6, 7

    // Double Harmonic Derivatives
    DOUBLE_HARMONIC_PENTATONIC: [0, 1, 4, 7, 8], // 1, b2, 3, 5, b6 (Omitting 4th and 7th)
    DOUBLE_HARMONIC_HEXATONIC_M2: [0, 1, 2, 4, 7, 8], // 1, b2, 2, 3, 5, b6 (Pentatonic + Major 2nd)
    DOUBLE_HARMONIC_HEXATONIC_AUG4: [0, 1, 4, 6, 7, 8] // 1, b2, 3, #4, 5, b6 (Pentatonic + Aug 4th)
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

const FLAT_MAJOR_PITCH_CLASSES = new Set([1, 3, 5, 8, 10]);

const RELATIVE_MAJOR_OFFSETS: Record<ScaleType, number> = {
    MAJOR: 0,
    MINOR: 3,
    PENTATONIC_MAJOR: 0,
    PENTATONIC_MINOR: 3,
    BLUES: 3,
    IONIAN: 0,
    DORIAN: 10,
    PHRYGIAN: 8,
    LYDIAN: 7,
    MIXOLYDIAN: 5,
    AEOLIAN: 3,
    LOCRIAN: 1,
    DOUBLE_HARMONIC: 0,
    HUNGARIAN_MINOR: 3,
    NEAPOLITAN_MINOR: 3,
    NEAPOLITAN_MAJOR: 3,
    HARMONIC_MINOR: 3,
    MELODIC_MINOR: 3,
    DOUBLE_HARMONIC_PENTATONIC: 0,
    DOUBLE_HARMONIC_HEXATONIC_M2: 0,
    DOUBLE_HARMONIC_HEXATONIC_AUG4: 0
};

export const shouldUseFlats = (root: Note, scaleType: ScaleType): boolean => {
    const rootIndex = getNoteIndex(root);
    if (rootIndex === -1) return false;

    if (root.includes('b')) return true;

    const offset = RELATIVE_MAJOR_OFFSETS[scaleType] ?? 0;
    const relativeMajorIndex = (rootIndex + offset) % 12;
    return FLAT_MAJOR_PITCH_CLASSES.has(relativeMajorIndex);
};

/**
 * Rotates the chromatic scale so it starts with the given root pitch class index.
 */
const getRotatedScale = (rootIndex: number, useFlats: boolean): Note[] => {
    if (rootIndex === -1) {
        throw new Error(`Invalid root index`);
    }
    const chromatic = useFlats ? FLATS_SCALE : SHARPS_SCALE;
    return [
        ...chromatic.slice(rootIndex),
        ...chromatic.slice(0, rootIndex)
    ];
};

/**
 * Returns the notes in the scale for a given root note and scale intervals.
 */
export const getScale = (root: Note, scaleType: ScaleType = 'MAJOR'): Note[] => {
    const rootIndex = getNoteIndex(root);
    if (rootIndex === -1) return [];

    const intervals = SCALES[scaleType];
    const degrees = SCALE_DEGREES[scaleType];

    return intervals.map((interval, i) => {
        const targetPitchClass = (rootIndex + interval) % 12;
        // If we know the exact spelling degree expected, use it. Otherwise fallback to generic chromatic grab.
        if (degrees && typeof degrees[i] === 'number') {
            return getProperSpelling(root, targetPitchClass, degrees[i]);
        }
        const useFlats = shouldUseFlats(root, scaleType);
        const rotatedChromatic = getRotatedScale(rootIndex, useFlats);
        return rotatedChromatic[interval];
    });
};

export type ScaleCategory = 'MAJOR_BASED' | 'MINOR_BASED' | 'OTHER';

export const SCALE_CATEGORIES: Record<ScaleCategory, ScaleType[]> = {
    MAJOR_BASED: [
        'MAJOR', 'IONIAN', 'LYDIAN', 'MIXOLYDIAN', 'PENTATONIC_MAJOR', 'DOUBLE_HARMONIC'
    ],
    MINOR_BASED: [
        'MINOR', 'AEOLIAN', 'DORIAN', 'PHRYGIAN', 'HARMONIC_MINOR', 'MELODIC_MINOR',
        'PENTATONIC_MINOR', 'HUNGARIAN_MINOR', 'NEAPOLITAN_MINOR', 'NEAPOLITAN_MAJOR'
    ],
    OTHER: [
        'BLUES', 'LOCRIAN', 'DOUBLE_HARMONIC_PENTATONIC', 'DOUBLE_HARMONIC_HEXATONIC_M2', 'DOUBLE_HARMONIC_HEXATONIC_AUG4'
    ]
};

export const getScaleAlterations = (scaleType: ScaleType): string[] => {
    let baseRef: number[];
    let isMinor = false;
    
    if (scaleType === 'MAJOR' || scaleType === 'MINOR') return [];

    if (SCALE_CATEGORIES.MAJOR_BASED.includes(scaleType)) {
        baseRef = SCALES.MAJOR;
    } else if (SCALE_CATEGORIES.MINOR_BASED.includes(scaleType)) {
        baseRef = SCALES.MINOR;
        isMinor = true;
    } else {
        return [];
    }

    const scaleIntervals = SCALES[scaleType];
    const intervalsSet = new Set(scaleIntervals);
    const baseSet = new Set(baseRef);
    
    const added = scaleIntervals.filter(i => !baseSet.has(i));
    const removed = baseRef.filter(i => !intervalsSet.has(i));
    
    let alterations: string[] = [];
    
    if (scaleIntervals.length < baseRef.length) {
        removed.forEach(r => {
            const name = INTERVAL_NAMES[r];
            alterations.push(`omit ${name}`);
        });
    }

    added.forEach(a => {
        const name = INTERVAL_NAMES[a];
        if (isMinor) {
            if (a === 11) alterations.push('♮7');
            else if (a === 9) alterations.push('♮6');
            else if (a === 6) alterations.push('#4');
            else alterations.push(name);
        } else {
            if (a === 6) alterations.push('#4');
            else alterations.push(name);
        }
    });

    return alterations;
};


// Instrument Configuration
export type Instrument = 'GUITAR' | 'BASS' | 'UKULELE';

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
    },
    UKULELE: {
        name: 'Ukulele',
        strings: 4,
        defaultTuning: [9, 4, 0, 7], // A, E, C, G (High to Low index, standard re-entrant High G)
        baseSemitones: [57, 52, 48, 55], // A4, E4, C4, G4
        inlayCenterStringIndex: 1
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
    NEW_STANDARD: { name: 'New Standard (NST)', offsets: [3, 5, 2, 0, -2, -4] }, // G E A D G C (High to Low)
    BARITONE_NST: { name: 'Baritone NST (GDAEBD)', offsets: [-2, 0, -3, -5, -7, -9] }, // D B E A D G (High to Low)
    BARITONE_DROP_A: { name: 'Baritone Drop A', offsets: [-5, -5, -5, -5, -5, -7] }, // B F# D A E A (High to Low)
    HALF_STEP_DOWN: { name: 'Half Step Down', offsets: [-1, -1, -1, -1, -1, -1] }
};

export const GUITAR_TUNINGS_7: Record<string, Tuning> = {
    STANDARD: { name: 'Standard (BEADGBE)', offsets: [0, 0, 0, 0, 0, 0, 0] },
    DROP_A: { name: 'Drop A (AEADGBE)', offsets: [0, 0, 0, 0, 0, 0, -2] }, // Drop Low B (Index 6)
    HALF_STEP_DOWN: { name: 'Half Step Down', offsets: [-1, -1, -1, -1, -1, -1, -1] }
};

export const GUITAR_TUNINGS_8: Record<string, Tuning> = {
    STANDARD: { name: 'Standard (F#BEADGBE)', offsets: [0, 0, 0, 0, 0, 0, 0, 0] },
    DROP_E: { name: 'Drop E (EBEADGBE)', offsets: [0, 0, 0, 0, 0, 0, 0, -2] }, // Drop Low F#
    HALF_STEP_DOWN: { name: 'Half Step Down', offsets: [-1, -1, -1, -1, -1, -1, -1, -1] }
};

// Chord Theory

export type ChordQuality =
    | 'MAJOR' | 'MINOR' | 'DIMINISHED' | 'AUGMENTED' | 'MAJB5' | 'SUS2B5'
    | 'SUS2' | 'SUS4'
    | 'ADD2' | 'ADD4' | 'ADD6' | 'ADD9' | 'MINADD9'
    | 'DOM7' | 'MAJ7' | 'MIN7' | 'MIN7B5' | 'DIM7' | 'MINMAJ7'
    | 'DOM9' | 'MAJ9' | 'MIN9'
    | 'DOM11' | 'MAJ11' | 'MIN11'
    | 'DOM13' | 'MAJ13' | 'MIN13';

export interface ChordInfo {
    root: Note;
    quality: ChordQuality;
    notes: Note[];
    displayName: string;
    romanNumeral: string;
}

// Intervals for chord construction
export const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
    MAJOR: [0, 4, 7],
    MINOR: [0, 3, 7],
    DIMINISHED: [0, 3, 6],
    AUGMENTED: [0, 4, 8],
    MAJB5: [0, 4, 6],
    SUS2B5: [0, 2, 6],
    SUS2: [0, 2, 7],
    SUS4: [0, 5, 7],
    ADD2: [0, 2, 4, 7],
    ADD4: [0, 4, 5, 7],
    ADD6: [0, 4, 7, 9],
    ADD9: [0, 4, 7, 14],
    MINADD9: [0, 3, 7, 14],
    DOM7: [0, 4, 7, 10],
    MAJ7: [0, 4, 7, 11],
    MIN7: [0, 3, 7, 10],
    MIN7B5: [0, 3, 6, 10],
    DIM7: [0, 3, 6, 9],
    MINMAJ7: [0, 3, 7, 11],
    DOM9: [0, 4, 7, 10, 14],
    MAJ9: [0, 4, 7, 11, 14],
    MIN9: [0, 3, 7, 10, 14],
    DOM11: [0, 4, 7, 10, 14, 17],
    MAJ11: [0, 4, 7, 11, 14, 17],
    MIN11: [0, 3, 7, 10, 14, 17],
    DOM13: [0, 4, 7, 10, 14, 17, 21],
    MAJ13: [0, 4, 7, 11, 14, 17, 21],
    MIN13: [0, 3, 7, 10, 14, 17, 21]
};

// Map chord qualities to their diatonic scale degrees mapping so spelling logic works.
// E.g. minor 3rd is degree 2 (0, 1, 2)
export const CHORD_DEGREES: Record<ChordQuality, number[]> = {
    MAJOR: [0, 2, 4],
    MINOR: [0, 2, 4],
    DIMINISHED: [0, 2, 4],
    AUGMENTED: [0, 2, 4],
    MAJB5: [0, 2, 4],
    SUS2B5: [0, 1, 4], // spelled as a 2nd (readable name) even when the scale letter is a b3
    SUS2: [0, 1, 4],
    SUS4: [0, 3, 4],
    ADD2: [0, 1, 2, 4],
    ADD4: [0, 2, 3, 4],
    ADD6: [0, 2, 4, 5],
    ADD9: [0, 2, 4, 1], // 9th is same letter as 2nd
    MINADD9: [0, 2, 4, 1],
    DOM7: [0, 2, 4, 6],
    MAJ7: [0, 2, 4, 6],
    MIN7: [0, 2, 4, 6],
    MIN7B5: [0, 2, 4, 6],
    DIM7: [0, 2, 4, 6],
    MINMAJ7: [0, 2, 4, 6],
    DOM9: [0, 2, 4, 6, 1],
    MAJ9: [0, 2, 4, 6, 1],
    MIN9: [0, 2, 4, 6, 1],
    DOM11: [0, 2, 4, 6, 1, 3],
    MAJ11: [0, 2, 4, 6, 1, 3],
    MIN11: [0, 2, 4, 6, 1, 3],
    DOM13: [0, 2, 4, 6, 1, 3, 5],
    MAJ13: [0, 2, 4, 6, 1, 3, 5],
    MIN13: [0, 2, 4, 6, 1, 3, 5]
};

// --- Diatonic harmonization ---
// Heptatonic scales whose stacked-thirds triads all classify into a named
// ChordQuality. The exotic scales rely on the MAJB5 ([0,4,6]) and SUS2B5
// ([0,2,6]) qualities for their altered-fifth degrees. A test asserts this
// list matches the derivation.
export const HARMONIZABLE_SCALES = [
    'MAJOR', 'MINOR', 'IONIAN', 'DORIAN', 'PHRYGIAN', 'LYDIAN',
    'MIXOLYDIAN', 'AEOLIAN', 'LOCRIAN', 'HARMONIC_MINOR', 'MELODIC_MINOR',
    'DOUBLE_HARMONIC', 'HUNGARIAN_MINOR', 'NEAPOLITAN_MINOR', 'NEAPOLITAN_MAJOR'
] as const;
export type HarmonizableScale = (typeof HARMONIZABLE_SCALES)[number];

const TRIAD_QUALITY_BY_STACK: Record<string, ChordQuality> = {
    '4,3': 'MAJOR',
    '3,4': 'MINOR',
    '3,3': 'DIMINISHED',
    '4,4': 'AUGMENTED',
    '4,2': 'MAJB5',
    '2,4': 'SUS2B5'
};

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const DIATONIC_SUFFIXES: Partial<Record<ChordQuality, string>> = {
    MINOR: 'm',
    DIMINISHED: '°',
    AUGMENTED: '+',
    MAJB5: '(b5)',
    SUS2B5: 'sus2(b5)'
};

// Triad built on a scale degree by stacking scale thirds (degree, degree+2,
// degree+4). Undefined when the stack is not a standard triad — cannot
// happen for HARMONIZABLE_SCALES.
export const getDegreeTriadQuality = (intervals: number[], index: number): ChordQuality | undefined => {
    const root = intervals[index];
    const third = intervals[(index + 2) % 7] + (index + 2 >= 7 ? 12 : 0);
    const fifth = intervals[(index + 4) % 7] + (index + 4 >= 7 ? 12 : 0);
    return TRIAD_QUALITY_BY_STACK[`${third - root},${fifth - third}`];
};

export const getChordNotes = (root: Note, quality: ChordQuality, forceFlats?: boolean): Note[] => {
    const rootIndex = getNoteIndex(root);
    if (rootIndex === -1) throw new Error(`Invalid root note: ${root}`);
    
    const intervals = CHORD_INTERVALS[quality];
    const degrees = CHORD_DEGREES[quality];

    return intervals.map((interval, i) => {
        const targetPitchClass = (rootIndex + interval) % 12;
        if (degrees && typeof degrees[i] === 'number') {
            return getProperSpelling(root, targetPitchClass, degrees[i]);
        }
        
        // Fallback to legacy flat/sharp generic spelling
        const useFlats = forceFlats !== undefined ? forceFlats : (root.includes('b') || root === 'F');
        const rotatedChromatic = getRotatedScale(rootIndex, useFlats);
        return rotatedChromatic[interval % 12];
    });
};

export const getDiatonicChords = (keyRoot: Note, scaleType: HarmonizableScale): ChordInfo[] => {
    const intervals = SCALES[scaleType];
    if (intervals.length !== 7) return [];

    const scaleNotes = getScale(keyRoot, scaleType);
    const useFlats = shouldUseFlats(keyRoot, scaleType);
    const chords: ChordInfo[] = [];

    scaleNotes.forEach((note, index) => {
        const quality = getDegreeTriadQuality(intervals, index);
        if (!quality) return; // degree not harmonizable as a standard triad

        let roman = ROMAN_NUMERALS[index];
        if (quality === 'MINOR' || quality === 'DIMINISHED') roman = roman.toLowerCase();
        if (quality === 'DIMINISHED') roman += '°';
        if (quality === 'AUGMENTED') roman += '+';
        if (quality === 'MAJB5') roman += 'b5';
        // SUS2B5 keeps the plain numeral; the chord symbol carries the detail.

        chords.push({
            root: note,
            quality,
            notes: getChordNotes(note, quality, useFlats),
            displayName: `${note}${DIATONIC_SUFFIXES[quality] ?? ''}`,
            romanNumeral: roman
        });
    });

    return chords;
};

export const getSecondaryDominants = (keyRoot: Note, scaleType: HarmonizableScale): ChordInfo[] => {
    const diatonicChords = getDiatonicChords(keyRoot, scaleType);
    const useFlats = shouldUseFlats(keyRoot, scaleType);
    const results: ChordInfo[] = [];

    // Only major and minor degrees are tonicized (diminished and augmented
    // chords make no stable target), and the tonic's dominant is the primary
    // dominant, not a secondary one.
    diatonicChords.forEach((chord, degreeIndex) => {
        if (degreeIndex === 0) return;
        if (chord.quality !== 'MAJOR' && chord.quality !== 'MINOR') return;

        const targetRootIndex = getNoteIndex(chord.root);
        // V is a perfect fifth (7 semitones) up from target
        const rotated = getRotatedScale(targetRootIndex, useFlats);
        const secDomRoot = rotated[7];

        const quality: ChordQuality = 'DOM7'; // Secondary dominants are typically dominant 7ths
        const notes = getChordNotes(secDomRoot, quality, useFlats);

        results.push({
            root: secDomRoot,
            quality,
            notes,
            displayName: `${secDomRoot}7`,
            romanNumeral: `V7/${chord.romanNumeral}`
        });
    });

    return results;
};

export const getBorrowedChords = (keyRoot: Note, scaleType: HarmonizableScale): ChordInfo[] => {
    // Parallel-key interchange is only defined between the major/minor pair;
    // modes get no borrowed row.
    if (scaleType !== 'MAJOR' && scaleType !== 'MINOR') return [];

    const originalChords = getDiatonicChords(keyRoot, scaleType);
    const borrowedScaleType = scaleType === 'MAJOR' ? 'MINOR' : 'MAJOR';
    const borrowedChords = getDiatonicChords(keyRoot, borrowedScaleType);

    // Filter out chords that are identical in root and quality
    return borrowedChords.filter(bc => 
        !originalChords.some(oc => oc.root === bc.root && oc.quality === bc.quality)
    );
};

export const getChromaticMediants = (keyRoot: Note, scaleType: HarmonizableScale): ChordInfo[] => {
    // Mediants are defined relative to a major/minor tonic triad only.
    if (scaleType !== 'MAJOR' && scaleType !== 'MINOR') return [];

    const rootIndex = getNoteIndex(keyRoot);
    const useFlats = shouldUseFlats(keyRoot, scaleType);
    const diatonicChords = getDiatonicChords(keyRoot, scaleType);
    const tonicQuality = scaleType === 'MAJOR' ? 'MAJOR' : 'MINOR';
    const suffix = tonicQuality === 'MINOR' ? 'm' : '';

    const mediantIntervals = [3, 4, 8, 9]; // min 3rd, Maj 3rd, min 6th, Maj 6th

    const results: ChordInfo[] = [];

    mediantIntervals.forEach(interval => {
        let degreeIndex = 0;
        if (interval === 3 || interval === 4) degreeIndex = 2; // mediant (3rd)
        if (interval === 8 || interval === 9) degreeIndex = 5; // submediant (6th)

        const mediantRoot = getProperSpelling(keyRoot, (rootIndex + interval) % 12, degreeIndex);
        const notes = getChordNotes(mediantRoot, tonicQuality, useFlats);
        
        const isDiatonic = diatonicChords.some(dc => dc.root === mediantRoot && dc.quality === tonicQuality);
        if (!isDiatonic) {
            let roman = '';
            if (interval === 3) roman = 'bIII';
            if (interval === 4) roman = 'III';
            if (interval === 8) roman = 'bVI';
            if (interval === 9) roman = 'VI';

            if (tonicQuality === 'MINOR') {
                roman = roman.toLowerCase();
            }

            results.push({
                root: mediantRoot,
                quality: tonicQuality,
                notes,
                displayName: `${mediantRoot}${suffix}`,
                romanNumeral: roman
            });
        }
    });

    return results;
};

/**
 * Infers a chord name based on a root note and an array of notes it contains.
 */
export const inferChordName = (root: Note, notes: Note[]): string => {
    const rootIndex = getNoteIndex(root);
    if (rootIndex === -1) return root;

    const uniqueSemitones = new Set<number>();
    notes.forEach(n => {
        const idx = getNoteIndex(n);
        if (idx !== -1) {
            let diff = idx - rootIndex;
            if (diff < 0) diff += 12;
            uniqueSemitones.add(diff);
        }
    });

    const semitones = Array.from(uniqueSemitones).sort((a, b) => a - b);
    const key = semitones.join(',');

    // Evaluate basic triads and 7ths first
    if (key.includes('0,4,7') && key.includes('11')) return `${root}maj7`;
    if (key.includes('0,4,7') && key.includes('10')) return `${root}7`;
    if (key.includes('0,3,7') && key.includes('10')) return `${root}m7`;
    if (key.includes('0,3,7') && key.includes('11')) return `${root}mM7`;
    if (key.includes('0,3,6') && key.includes('10')) return `${root}m7b5`;
    if (key.includes('0,3,6') && key.includes('9')) return `${root}dim7`;

    // Extended
    if (key.includes('0,4,7,10') && key.includes('2')) return `${root}9`;
    if (key.includes('0,3,7,10') && key.includes('2')) return `${root}m9`;
    if (key.includes('0,4,7,11') && key.includes('2')) return `${root}maj9`;

    // Added
    if (key.includes('0,4,7') && key.includes('2')) return `${root}add9`;
    if (key.includes('0,3,7') && key.includes('2')) return `${root}m(add9)`;
    if (key.includes('0,4,7') && key.includes('9')) return `${root}6`;
    if (key.includes('0,3,7') && key.includes('9')) return `${root}m6`;

    // Suspended
    if (key.includes('0,2,7')) return `${root}sus2`;
    if (key.includes('0,5,7')) return `${root}sus4`;

    // Triads
    if (key.includes('0,4,7')) return `${root}`;
    if (key.includes('0,3,7')) return `${root}m`;
    if (key.includes('0,4,8')) return `${root}aug`;
    if (key.includes('0,4,6')) return `${root}(b5)`;
    if (key.includes('0,2,6')) return `${root}sus2(b5)`;
    if (key.includes('0,3,6')) return `${root}dim`;

    return `${root}*`;
};

/**
 * Returns the note at a specific string (0-based index) and fret (0-based index).
 * Takes an optional tuningOffset array to adjust the open string notes.
 */
export const getNoteAtPosition = (instrument: Instrument, stringIndex: number, fretIndex: number, tuningOffsets?: number[], stringCount?: number, useFlats?: boolean): Note => {
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
    return (useFlats ? FLATS_SCALE : SHARPS_SCALE)[chromaticIndex];
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

export interface QueuedChord {
    id: string;
    root: Note;
    quality: ChordQuality;
}

export const CHORD_SYMBOLS: Record<ChordQuality, string> = {
    MAJOR: '',
    MINOR: 'm',
    DIMINISHED: 'dim',
    AUGMENTED: 'aug',
    MAJB5: '(b5)',
    SUS2B5: 'sus2(b5)',
    SUS2: 'sus2',
    SUS4: 'sus4',
    ADD2: 'add2',
    ADD4: 'add4',
    ADD6: 'add6',
    ADD9: 'add9',
    MINADD9: 'm(add9)',
    DOM7: '7',
    MAJ7: 'maj7',
    MIN7: 'm7',
    MIN7B5: 'm7b5',
    DIM7: 'dim7',
    MINMAJ7: 'mM7',
    DOM9: '9',
    MAJ9: 'maj9',
    MIN9: 'm9',
    DOM11: '11',
    MAJ11: 'maj11',
    MIN11: 'm11',
    DOM13: '13',
    MAJ13: 'maj13',
    MIN13: 'm13'
};

// Wire format for shared queue URLs: qualities are encoded by index, so this
// list is append-only — inserting or reordering breaks previously shared links.
export const ENCODING_QUALITIES: ChordQuality[] = [
    'MAJOR', 'MINOR', 'DIMINISHED', 'AUGMENTED', 'SUS2', 'SUS4', 'ADD2', 'ADD4', 'ADD6', 'ADD9',
    'DOM7', 'MAJ7', 'MIN7', 'MIN7B5', 'DIM7', 'MINMAJ7', 'DOM9', 'MAJ9', 'MIN9', 'DOM11', 'MAJ11',
    'MIN11', 'DOM13', 'MAJ13', 'MIN13', 'MINADD9', 'MAJB5', 'SUS2B5'
];

export const encodeDense = (queue: QueuedChord[]): string => {
    return queue.map(c => {
        const rootIdx = ROOT_NOTES.indexOf(c.root);
        const qualIdx = ENCODING_QUALITIES.indexOf(c.quality);
        if (rootIdx === -1 || qualIdx === -1) return '';
        return String.fromCharCode(rootIdx + 65) + String.fromCharCode(qualIdx + 65);
    }).join('');
};

export const decodeDense = (str: string): QueuedChord[] => {
    const queue: QueuedChord[] = [];
    for (let i = 0; i < str.length; i += 2) {
        const rootChar = str.charCodeAt(i) - 65;
        const qualChar = str.charCodeAt(i + 1) - 65;
        if (rootChar >= 0 && rootChar < ROOT_NOTES.length && qualChar >= 0 && qualChar < ENCODING_QUALITIES.length) {
            queue.push({
                id: Date.now().toString() + Math.random().toString(36).substring(7),
                root: ROOT_NOTES[rootChar],
                quality: ENCODING_QUALITIES[qualChar]
            });
        }
    }
    return queue;
};
