import { describe, it, expect } from 'vitest';
import { getChordVoicings } from './chordVoicings';

describe('chordVoicings Algorithm', () => {
    it('should generate standard open C Major chord on standard guitar', () => {
        const voicings = getChordVoicings(
            'GUITAR',
            [], // Standard tuning offsets
            6,
            'C',
            'MAJOR',
            18,
            50
        );

        expect(voicings).toBeDefined();
        expect(voicings.length).toBeGreaterThan(0);

        // Open C major High-to-Low: High E(0), B(1), G(0), D(2), A(3), Low E(-1) -> [0, 1, 0, 2, 3, -1]
        const hasOpenC = voicings.some(v => v.frets.join(',') === '0,1,0,2,3,-1');
        expect(hasOpenC).toBe(true);

        // Standard 3rd fret barre C major High-to-Low: High E(3), B(5), G(5), D(5), A(3), Low E(-1) -> [3, 5, 5, 5, 3, -1]
        const hasAFormBarre = voicings.some(v => v.frets.join(',') === '3,5,5,5,3,-1');
        expect(hasAFormBarre).toBe(true);

        // Standard 8th fret barre C major High-to-Low: [8, 8, 9, 10, 10, 8]
        const hasEFormBarre = voicings.some(v => v.frets.join(',') === '8,8,9,10,10,8');
        expect(hasEFormBarre).toBe(true);
    });

    it('should calculate valid drop D voicings for D Major', () => {
        const dropDTuning = [0, 0, 0, 0, 0, -2]; // Low E drops to D

        const voicings = getChordVoicings(
            'GUITAR',
            dropDTuning,
            6,
            'D',
            'MAJOR',
            18,
            10
        );

        // Drop D power open chord for D Major: High E(2), B(3), G(2), D(0), A(0), Low D(0) -> [2, 3, 2, 0, 0, 0]
        const hasOpenDropDD = voicings.some(v => v.frets.join(',') === '2,3,2,0,0,0');
        expect(hasOpenDropDD).toBe(true);
    });

    it('should sort lowest fret and root bass preferentially', () => {
        const voicings = getChordVoicings(
            'GUITAR',
            [],
            6,
            'G',
            'MAJOR',
            18,
            5
        );

        const first = voicings[0];
        // High to low: [3, 0, 0, 0, 2, 3] or [3, 3, 0, 0, 2, 3]
        expect(['3,0,0,0,2,3', '3,3,0,0,2,3'].includes(first.frets.join(','))).toBe(true);
    });
});
