import { describe, it, expect } from 'vitest';
import {
    getScale,
    getDiatonicChords,
    getChordNotes,
    getNoteAtPosition
} from '@/utils/musicTheory';

describe('musicTheory', () => {
    describe('getScale', () => {
        it('should return correct notes for C Major', () => {
            const scale = getScale('C', 'MAJOR');
            expect(scale).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
        });

        it('should return correct notes for A Minor (Natural)', () => {
            const scale = getScale('A', 'MINOR');
            expect(scale).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
        });

        it('should handle sharp roots correctly (F# Major)', () => {
            // F#, G#, A#, B, C#, D#, F
            // Note: our system is simple chromatic, might map strictly to sharps as per CHROMATIC_SCALE
            const scale = getScale('F#', 'MAJOR');
            expect(scale).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'F']);
        });
    });

    describe('getDiatonicChords', () => {
        it('should return correct chords for C Major', () => {
            const chords = getDiatonicChords('C', 'MAJOR');

            expect(chords).toHaveLength(7);

            // I - C Major
            expect(chords[0].root).toBe('C');
            expect(chords[0].quality).toBe('MAJOR');
            expect(chords[0].romanNumeral).toBe('I');

            // ii - D Minor
            expect(chords[1].root).toBe('D');
            expect(chords[1].quality).toBe('MINOR');
            expect(chords[1].romanNumeral).toBe('ii');

            // vii° - B Diminished
            expect(chords[6].root).toBe('B');
            expect(chords[6].quality).toBe('DIMINISHED');
            expect(chords[6].romanNumeral).toBe('vii°');
        });

        it('should return correct chords for A Minor', () => {
            const chords = getDiatonicChords('A', 'MINOR');

            // i - A Minor
            expect(chords[0].root).toBe('A');
            expect(chords[0].quality).toBe('MINOR');
            expect(chords[0].romanNumeral).toBe('i');

            // III - C Major
            expect(chords[2].root).toBe('C');
            expect(chords[2].quality).toBe('MAJOR');
            expect(chords[2].romanNumeral).toBe('III');
        });
    });

    describe('getChordNotes', () => {
        it('should return correct notes for C Major Triad', () => {
            const notes = getChordNotes('C', 'MAJOR');
            expect(notes).toEqual(['C', 'E', 'G']);
        });

        it('should return correct notes for C Sus2', () => {
            const notes = getChordNotes('C', 'SUS2');
            expect(notes).toEqual(['C', 'D', 'G']);
        });

        it('should return correct notes for C Sus4', () => {
            const notes = getChordNotes('C', 'SUS4');
            expect(notes).toEqual(['C', 'F', 'G']);
        });

        it('should return correct notes for C Dom7', () => {
            const notes = getChordNotes('C', 'DOM7');
            expect(notes).toEqual(['C', 'E', 'G', 'A#']); // A# is the chromatic equivalent of Bb
        });

        it('should return correct notes for C Maj7', () => {
            const notes = getChordNotes('C', 'MAJ7');
            expect(notes).toEqual(['C', 'E', 'G', 'B']);
        });

        it('should return correct notes for C Augmented', () => {
            const notes = getChordNotes('C', 'AUGMENTED');
            expect(notes).toEqual(['C', 'E', 'G#']);
        });

        it('should return correct notes for C Diminished', () => {
            const notes = getChordNotes('C', 'DIMINISHED');
            expect(notes).toEqual(['C', 'D#', 'F#']);
        });

        it('should return correct notes for C Min7b5 (Half-Diminished)', () => {
            const notes = getChordNotes('C', 'MIN7B5');
            expect(notes).toEqual(['C', 'D#', 'F#', 'A#']);
        });

        it('should return correct notes for C Dom9', () => {
            const notes = getChordNotes('C', 'DOM9');
            expect(notes).toEqual(['C', 'E', 'G', 'A#', 'D']);
        });

        it('should return correct notes for C Maj13', () => {
            const notes = getChordNotes('C', 'MAJ13');
            expect(notes).toEqual(['C', 'E', 'G', 'B', 'D', 'F', 'A']);
        });

        it('should return correct notes for C Add9', () => {
            const notes = getChordNotes('C', 'ADD9');
            expect(notes).toEqual(['C', 'E', 'G', 'D']);
        });

        it('should return correct notes for C Add4', () => {
            const notes = getChordNotes('C', 'ADD4');
            expect(notes).toEqual(['C', 'E', 'F', 'G']);
        });

        it('should return correct notes for C Min11', () => {
            const notes = getChordNotes('C', 'MIN11');
            expect(notes).toEqual(['C', 'D#', 'G', 'A#', 'D', 'F']);
        });
    });

    describe('getNoteAtPosition', () => {
        // Standard Tuning: E B G D A E (High to Low). Index 0 is High E, Index 5 is Low E.
        it('should return correct open string notes (Standard)', () => {
            // String 0 (High E)
            expect(getNoteAtPosition('GUITAR', 0, 0, [])).toBe('E');
            // String 5 (Low E)
            expect(getNoteAtPosition('GUITAR', 5, 0, [])).toBe('E');
        });

        it('should return correct fretted notes', () => {
            // String 0 (High E), Fret 1 -> F
            expect(getNoteAtPosition('GUITAR', 0, 1, [])).toBe('F');
            // String 4 (A), Fret 2 -> B
            expect(getNoteAtPosition('GUITAR', 4, 2, [])).toBe('B');
        });

        it('should handle tuning offsets (Drop D)', () => {
            // Drop D: Low E (Index 5) dropped by 2 semitones to D
            const tuning = [0, 0, 0, 0, 0, -2];

            // String 5 (Low E dropped to D), Fret 0 -> D
            expect(getNoteAtPosition('GUITAR', 5, 0, tuning)).toBe('D');
            // String 5 (Low E dropped to D), Fret 2 -> E
            expect(getNoteAtPosition('GUITAR', 5, 2, tuning)).toBe('E');
        });
    });
});
