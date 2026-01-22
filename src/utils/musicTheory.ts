export type Note = string;

export const CHROMATIC_SCALE: Note[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
];

export const SCALES = {
  MAJOR: [0, 2, 4, 5, 7, 9, 11] // Intervals from root: Root, Major 2nd, Major 3rd, Perfect 4th, Perfect 5th, Major 6th, Major 7th
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
export const getScale = (root: Note, scaleType: keyof typeof SCALES = 'MAJOR'): Note[] => {
  const rotatedChromatic = getRotatedScale(root);
  const intervals = SCALES[scaleType];
  return intervals.map(interval => rotatedChromatic[interval]);
};

/**
 * Standard Guitar Tuning: E2, A2, D3, G3, B3, E4
 * We only care about the note name, not the octave for now, but tuning matters for relative intervals.
 * 0 = E, 1 = F, etc.
 * String 6 (Low E) -> E
 * String 5 (A) -> A
 * String 4 (D) -> D
 * String 3 (G) -> G
 * String 2 (B) -> B
 * String 1 (High E) -> E
 */
const STANDARD_TUNING_OFFSETS: number[] = [
    4,  // E (index 4 in C-based chromatic scale: C, C#, D, D#, E...)
    9,  // A
    2,  // D
    7,  // G
    11, // B
    4   // E
];

/**
 * Returns the note at a specific string (1-6) and fret (0-15+).
 * stringIndex: 0 is Low E (String 6), 5 is High E (String 1) - Wait, let's normalize.
 * Let's say top to bottom visually?
 * Usually String 1 is High E (bottom physically, top data-wise maybe?).
 * Let's Stick to: 
 * Index 0: Low E (Thickest)
 * Index 1: A
 * ...
 * Index 5: High E (Thinnest)
 */
const STRING_TUNING_INDICES = [4, 9, 2, 7, 11, 4]; // E, A, D, G, B, E indices in CHROMATIC_SCALE

export const getNoteAtPosition = (stringIndex: number, fretIndex: number): Note => {
  const openStringNoteIndex = STRING_TUNING_INDICES[stringIndex];
  const chromaticIndex = (openStringNoteIndex + fretIndex) % 12;
  return CHROMATIC_SCALE[chromaticIndex];
};
