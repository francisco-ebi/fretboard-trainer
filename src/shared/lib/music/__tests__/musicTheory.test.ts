import { describe, it, expect } from 'vitest';
import { getScale, getChordNotes, getDiatonicChords, getSecondaryDominants, getBorrowedChords, getChromaticMediants, getDegreeTriadQuality, getNoteIndex, areEnharmonicallyEquivalent, getInterval, getNoteName, ROOT_NOTES, CHORD_INTERVALS, HARMONIZABLE_SCALES, SCALES, type ChordQuality, type ScaleType } from '../musicTheory';

describe('musicTheory - Enharmonic Spelling', () => {
    describe('getScale', () => {
        it('should correctly spell F# Major scale with E#', () => {
            const result = getScale('F#', 'MAJOR');
            expect(result).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
        });

        it('should correctly spell Cb Major scale with flats', () => {
            const result = getScale('Cb', 'MAJOR');
            expect(result).toEqual(['Cb', 'Db', 'Eb', 'Fb', 'Gb', 'Ab', 'Bb']);
        });

        it('should correctly spell C Major scale', () => {
            const result = getScale('C', 'MAJOR');
            expect(result).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
        });

        it('should spell Eb Blues with correct chromatic passing tone', () => {
            // Eb Blues: Eb, Gb, Ab, A(nat), Bb, Db
            const result = getScale('Eb', 'BLUES');
            expect(result).toEqual(['Eb', 'Gb', 'Ab', 'A', 'Bb', 'Db']);
        });

        it('should spell Bb Dorian mode correctly', () => {
            // Bb, C, Db, Eb, F, G, Ab
            const result = getScale('Bb', 'DORIAN');
            expect(result).toEqual(['Bb', 'C', 'Db', 'Eb', 'F', 'G', 'Ab']);
        });

        it('should spell G Mixolydian mode correctly', () => {
            // G, A, B, C, D, E, F
            const result = getScale('G', 'MIXOLYDIAN');
            expect(result).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F']);
        });

        it('should correctly spell C# Minor scale', () => {
            const result = getScale('C#', 'MINOR');
            expect(result).toEqual(['C#', 'D#', 'E', 'F#', 'G#', 'A', 'B']);
        });
        
        it('should correctly spell A Pentatonic Minor scale', () => {
            const result = getScale('A', 'PENTATONIC_MINOR');
            expect(result).toEqual(['A', 'C', 'D', 'E', 'G']);
        });
    });

    describe('getChordNotes', () => {
        it('should spell D# Minor chord with F#', () => {
            const result = getChordNotes('D#', 'MINOR');
            expect(result).toEqual(['D#', 'F#', 'A#']);
        });

        it('should spell F# Major chord with A#', () => {
            const result = getChordNotes('F#', 'MAJOR');
            expect(result).toEqual(['F#', 'A#', 'C#']);
        });
        
        it('should spell Gb Major chord with Bb', () => {
            const result = getChordNotes('Gb', 'MAJOR');
            expect(result).toEqual(['Gb', 'Bb', 'Db']);
        });

        it('should spell E Diminished chord', () => {
            const result = getChordNotes('E', 'DIMINISHED');
            expect(result).toEqual(['E', 'G', 'Bb']);
        });

        it('should spell A Major 7 chord correctly', () => {
            const result = getChordNotes('A', 'MAJ7');
            expect(result).toEqual(['A', 'C#', 'E', 'G#']);
        });

        it('should spell Bb Minor 7 chord correctly', () => {
            const result = getChordNotes('Bb', 'MIN7');
            expect(result).toEqual(['Bb', 'Db', 'F', 'Ab']);
        });

        it('should spell C Dominant 9 chord correctly', () => {
            // C E G Bb D
            const result = getChordNotes('C', 'DOM9');
            expect(result).toEqual(['C', 'E', 'G', 'Bb', 'D']);
        });

        it('should spell E Minor Add9 with a minor third', () => {
            // Modifier "add9" on a minor triad must keep the b3 (E G B F#),
            // unlike ADD9 whose intervals carry a major third.
            const result = getChordNotes('E', 'MINADD9');
            expect(result).toEqual(['E', 'G', 'B', 'F#']);
        });

        it('should spell G Major b5 with a flattened fifth letter', () => {
            const result = getChordNotes('G', 'MAJB5');
            expect(result).toEqual(['G', 'B', 'Db']);
        });

        it('should spell B Sus2 b5 with a second, not a diminished third', () => {
            // Readability choice: B·C#·F rather than the scale letter B·Db·F.
            const result = getChordNotes('B', 'SUS2B5');
            expect(result).toEqual(['B', 'C#', 'F']);
        });
    });

    describe('getDiatonicChords', () => {
        it('should generate correctly spelled diatonic chords for C Major', () => {
            const result = getDiatonicChords('C', 'MAJOR');
            expect(result.map(c => c.root)).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
            expect(result.map(c => c.quality)).toEqual([
                'MAJOR', 'MINOR', 'MINOR', 'MAJOR', 'MAJOR', 'MINOR', 'DIMINISHED'
            ]);
            // Check specific spelling of vi
            expect(result[5].notes).toEqual(['A', 'C', 'E']);
        });

        it('should generate correctly spelled diatonic chords for F# Major', () => {
            const result = getDiatonicChords('F#', 'MAJOR');
            // Root should be E# for vii°
            expect(result.map(c => c.root)).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
            
            const viiDim = result[6];
            expect(viiDim.quality).toBe('DIMINISHED');
            expect(viiDim.notes).toEqual(['E#', 'G#', 'B']);
            
            const iiMin = result[1];
            expect(iiMin.notes).toEqual(['G#', 'B', 'D#']);
        });
        
        it('should generate correctly spelled diatonic chords for Eb Minor', () => {
            const result = getDiatonicChords('Eb', 'MINOR');
            expect(result.map(c => c.root)).toEqual(['Eb', 'F', 'Gb', 'Ab', 'Bb', 'Cb', 'Db']);

            const vMin = result[4];
            expect(vMin.quality).toBe('MINOR');
            expect(vMin.notes).toEqual(['Bb', 'Db', 'F']);
        });

        it('should keep the historical roman numeral scheme for major and minor', () => {
            expect(getDiatonicChords('C', 'MAJOR').map(c => c.romanNumeral))
                .toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
            expect(getDiatonicChords('A', 'MINOR').map(c => c.romanNumeral))
                .toEqual(['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
        });

        it('should harmonize A Harmonic Minor with augmented III and major V', () => {
            const result = getDiatonicChords('A', 'HARMONIC_MINOR');
            expect(result.map(c => c.displayName)).toEqual(['Am', 'B°', 'C+', 'Dm', 'E', 'F', 'G#°']);
            expect(result.map(c => c.quality)).toEqual([
                'MINOR', 'DIMINISHED', 'AUGMENTED', 'MINOR', 'MAJOR', 'MAJOR', 'DIMINISHED'
            ]);
            expect(result.map(c => c.romanNumeral)).toEqual(['i', 'ii°', 'III+', 'iv', 'V', 'VI', 'vii°']);
        });

        it('should harmonize A Melodic Minor with two diminished degrees', () => {
            const result = getDiatonicChords('A', 'MELODIC_MINOR');
            expect(result.map(c => c.displayName)).toEqual(['Am', 'Bm', 'C+', 'D', 'E', 'F#°', 'G#°']);
        });

        it('should harmonize D Dorian with the characteristic major IV', () => {
            const result = getDiatonicChords('D', 'DORIAN');
            expect(result.map(c => c.displayName)).toEqual(['Dm', 'Em', 'F', 'G', 'Am', 'B°', 'C']);
            expect(result.map(c => c.romanNumeral)).toEqual(['i', 'ii', 'III', 'IV', 'v', 'vi°', 'VII']);
        });

        it('should harmonize B Locrian with a diminished tonic', () => {
            const result = getDiatonicChords('B', 'LOCRIAN');
            expect(result[0].displayName).toBe('B°');
            expect(result[0].romanNumeral).toBe('i°');
        });

        it('should spell the raised leading tone chord of C# Harmonic Minor with B#', () => {
            const result = getDiatonicChords('C#', 'HARMONIC_MINOR');
            expect(result[6].root).toBe('B#');
            expect(result[6].quality).toBe('DIMINISHED');
        });

        it('should harmonize C Double Harmonic with b5 and sus2b5 degrees', () => {
            const result = getDiatonicChords('C', 'DOUBLE_HARMONIC');
            expect(result.map(c => c.displayName)).toEqual([
                'C', 'Db', 'Em', 'Fm', 'G(b5)', 'Ab+', 'Bsus2(b5)'
            ]);
            expect(result.map(c => c.romanNumeral)).toEqual([
                'I', 'II', 'iii', 'iv', 'Vb5', 'VI+', 'VII'
            ]);
        });

        it('should harmonize C Hungarian Minor', () => {
            const result = getDiatonicChords('C', 'HUNGARIAN_MINOR');
            expect(result.map(c => c.displayName)).toEqual([
                'Cm', 'D(b5)', 'Eb+', 'F#sus2(b5)', 'G', 'Ab', 'Bm'
            ]);
        });
    });

    describe('HARMONIZABLE_SCALES', () => {
        it('should contain exactly the heptatonic scales whose degrees all form standard triads', () => {
            const derived = (Object.keys(SCALES) as ScaleType[]).filter(scale => {
                const intervals = SCALES[scale];
                if (intervals.length !== 7) return false;
                return intervals.every((_, i) => getDegreeTriadQuality(intervals, i) !== undefined);
            });
            expect([...HARMONIZABLE_SCALES].sort()).toEqual(derived.sort());
        });

        it('should produce a chord for every degree of every harmonizable scale', () => {
            for (const scale of HARMONIZABLE_SCALES) {
                expect(getDiatonicChords('C', scale)).toHaveLength(7);
            }
        });
    });

    describe('getSecondaryDominants', () => {
        it('should return correct secondary dominants for C Major', () => {
            const result = getSecondaryDominants('C', 'MAJOR');
            // Expected targets: ii (D), iii (E), IV (F), V (G), vi (A)
            // V/ii = A7, V/iii = B7, V/IV = C7, V/V = D7, V/vi = E7
            expect(result.length).toBe(5);
            expect(result.map(c => c.root)).toEqual(['A', 'B', 'C', 'D', 'E']);
            expect(result.every(c => c.quality === 'DOM7')).toBe(true);
            expect(result.map(c => c.romanNumeral)).toEqual(['V7/ii', 'V7/iii', 'V7/IV', 'V7/V', 'V7/vi']);
        });

        it('should spell the dominant root a proper fifth above its target', () => {
            // Db's dominant is Ab7, not G#7, even though C Double Harmonic
            // resolves to a sharp-side key signature heuristic.
            const doubleHarmonic = getSecondaryDominants('C', 'DOUBLE_HARMONIC');
            const vOfII = doubleHarmonic.find(c => c.romanNumeral === 'V7/II');
            expect(vOfII?.root).toBe('Ab');
            expect(vOfII?.displayName).toBe('Ab7');

            // Sharp keys get proper leading-tone spelling: A#m's dominant is
            // E#7, not F7.
            const fSharpMajor = getSecondaryDominants('F#', 'MAJOR');
            const vOfIii = fSharpMajor.find(c => c.romanNumeral === 'V7/iii');
            expect(vOfIii?.root).toBe('E#');
        });
    });

    describe('getBorrowedChords', () => {
        it('should return modal interchange chords for C Major from C Minor', () => {
            const result = getBorrowedChords('C', 'MAJOR');
            // C minor diatonic: Cm, Ddim, Eb, Fm, Gm, Ab, Bb
            // None of these have identical root AND quality as C Major diatonics.
            expect(result.length).toBe(7);
            expect(result.map(c => c.root)).toEqual(['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb']);
            expect(result[0].quality).toBe('MINOR'); // Cm
            expect(result[2].quality).toBe('MAJOR'); // Eb Major
        });
    });

    describe('getChromaticMediants', () => {
        it('should return chromatic mediants for C Major', () => {
            const result = getChromaticMediants('C', 'MAJOR');
            // min 3rd (Eb), Maj 3rd (E), min 6th (Ab), Maj 6th (A)
            expect(result.length).toBe(4);
            expect(result.map(c => c.root)).toEqual(['Eb', 'E', 'Ab', 'A']);
            expect(result.every(c => c.quality === 'MAJOR')).toBe(true);
            expect(result.map(c => c.romanNumeral)).toEqual(['bIII', 'III', 'bVI', 'VI']);
        });

        it('should return chromatic mediants for A Minor', () => {
            const result = getChromaticMediants('A', 'MINOR');
            // min 3rd (C), Maj 3rd (C#), min 6th (F), Maj 6th (F#)
            // Tonic is Minor, so quality is MINOR.
            expect(result.length).toBe(4);
            expect(result.map(c => c.root)).toEqual(['C', 'C#', 'F', 'F#']);
            expect(result.every(c => c.quality === 'MINOR')).toBe(true);
            expect(result.map(c => c.romanNumeral)).toEqual(['biii', 'iii', 'bvi', 'vi']);
        });
    });
});

describe('musicTheory - Double accidentals', () => {
    // getProperSpelling emits double sharps/flats, so every consumer that
    // resolves a spelling to a pitch class has to parse them. When it did not,
    // the Cx in A#7 matched no fret and vanished from the fretboard.
    describe('getNoteIndex', () => {
        it('should resolve double sharps and double flats', () => {
            expect(getNoteIndex('Cx')).toBe(2);   // D
            expect(getNoteIndex('Fx')).toBe(7);   // G
            expect(getNoteIndex('Bx')).toBe(1);   // C#
            expect(getNoteIndex('Bbb')).toBe(9);  // A
            expect(getNoteIndex('Abb')).toBe(7);  // G
            expect(getNoteIndex('Cbb')).toBe(10); // Bb
        });

        it('should still resolve single accidentals and naturals', () => {
            expect(getNoteIndex('C')).toBe(0);
            expect(getNoteIndex('A#')).toBe(10);
            expect(getNoteIndex('Bb')).toBe(10);
            expect(getNoteIndex('Cb')).toBe(11);
            expect(getNoteIndex('Fb')).toBe(4);
            expect(getNoteIndex('E#')).toBe(5);
            expect(getNoteIndex('B#')).toBe(0);
        });

        it('should reject anything that is not a pitch', () => {
            expect(getNoteIndex('H')).toBe(-1);
            expect(getNoteIndex('')).toBe(-1);
            expect(getNoteIndex('C4')).toBe(-1);
            expect(getNoteIndex('Cmaj')).toBe(-1);
        });
    });

    it('should match a double-sharp chord tone to its fretboard spelling', () => {
        // The fretboard keys cells off areEnharmonicallyEquivalent
        expect(getChordNotes('A#', 'DOM7')).toEqual(['A#', 'Cx', 'E#', 'G#']);
        expect(areEnharmonicallyEquivalent('Cx', 'D')).toBe(true);
        expect(areEnharmonicallyEquivalent('Fx', 'G')).toBe(true);
        expect(areEnharmonicallyEquivalent('Bbb', 'A')).toBe(true);
        expect(areEnharmonicallyEquivalent('Cx', 'C#')).toBe(false);
    });

    it('should label the interval of a double-accidental chord tone', () => {
        expect(getInterval('A#', 'Cx')).toBe('3');   // major 3rd, not '?'
        expect(getInterval('C', 'Bbb')).toBe('6');   // dim 7th of C dim7
        expect(getInterval('D#', 'Fx')).toBe('3');
    });

    it('should render double accidentals in solfege', () => {
        expect(getNoteName('Cx', 'SOLFEGE')).toBe('Dox');
        expect(getNoteName('Bbb', 'SOLFEGE')).toBe('Sibb');
        // unchanged for the spellings that were already mapped
        expect(getNoteName('A#', 'SOLFEGE')).toBe('La#');
        expect(getNoteName('Gb', 'SOLFEGE')).toBe('Solb');
        expect(getNoteName('Sol', 'ENGLISH')).toBe('Sol');
    });

    it('should resolve every note of every root/quality pair in the library', () => {
        const unresolved: string[] = [];
        for (const root of ROOT_NOTES) {
            for (const quality of Object.keys(CHORD_INTERVALS) as ChordQuality[]) {
                for (const note of getChordNotes(root, quality)) {
                    if (getNoteIndex(note) === -1) unresolved.push(`${root}${quality}: ${note}`);
                }
            }
        }
        expect(unresolved).toEqual([]);
    });

    it('should resolve every note of every root/scale pair in the library', () => {
        const unresolved: string[] = [];
        for (const root of ROOT_NOTES) {
            for (const scale of Object.keys(SCALES) as ScaleType[]) {
                for (const note of getScale(root, scale)) {
                    if (getNoteIndex(note) === -1) unresolved.push(`${root} ${scale}: ${note}`);
                }
            }
        }
        expect(unresolved).toEqual([]);
    });
});
