import { describe, it, expect } from 'vitest';
import { getScale, getChordNotes, getDiatonicChords } from '../musicTheory';

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
});
