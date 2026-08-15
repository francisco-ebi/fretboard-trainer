import { describe, it, expect, beforeEach } from 'vitest';
import {
    calculatePlayedFret,
    isValidFret,
    PracticeNoteHandler
} from './practiceAudio';
import { type EngineNoteEvent } from './recording-engine';

describe('calculatePlayedFret', () => {
    // Standard 6-string guitar: E4 (52), B3 (47), G3 (43), D3 (38), A2 (33), E2 (28) above C0
    const standardPitches = [52, 47, 43, 38, 33, 28];

    it('calculates open string frets correctly on all strings', () => {
        expect(calculatePlayedFret(64, 0, standardPitches)).toBe(0); // High E (E4 = 64)
        expect(calculatePlayedFret(59, 1, standardPitches)).toBe(0); // B3 = 59
        expect(calculatePlayedFret(55, 2, standardPitches)).toBe(0); // G3 = 55
        expect(calculatePlayedFret(50, 3, standardPitches)).toBe(0); // D3 = 50
        expect(calculatePlayedFret(45, 4, standardPitches)).toBe(0); // A2 = 45
        expect(calculatePlayedFret(40, 5, standardPitches)).toBe(0); // Low E (E2 = 40)
    });

    it('calculates fretted notes accurately', () => {
        // String 0 (High E): Fret 5 is A4 (MIDI 69)
        expect(calculatePlayedFret(69, 0, standardPitches)).toBe(5);

        // String 2 (G string): Fret 7 is D4 (MIDI 62)
        expect(calculatePlayedFret(62, 2, standardPitches)).toBe(7);

        // String 5 (Low E): Fret 12 is E3 (MIDI 52)
        expect(calculatePlayedFret(52, 5, standardPitches)).toBe(12);
    });

    it('handles altered tunings like Drop D', () => {
        // Drop D: String 5 is D2 (28 - 2 = 26 above C0, open MIDI = 38)
        const dropDPitches = [52, 47, 43, 38, 33, 26];

        // Open string 5 is D2 (MIDI 38) -> Fret 0
        expect(calculatePlayedFret(38, 5, dropDPitches)).toBe(0);
        // Fret 2 on string 5 is E2 (MIDI 40) -> Fret 2
        expect(calculatePlayedFret(40, 5, dropDPitches)).toBe(2);
    });

    it('returns negative fret when note is lower than open string', () => {
        // Playing D4 (MIDI 62) on High E string (open E4 = 64) gives fret -2
        expect(calculatePlayedFret(62, 0, standardPitches)).toBe(-2);
    });

    it('returns -1 for invalid string indices', () => {
        expect(calculatePlayedFret(64, -1, standardPitches)).toBe(-1);
        expect(calculatePlayedFret(64, 6, standardPitches)).toBe(-1);
    });
});

describe('isValidFret', () => {
    it('accepts frets in range 0..18', () => {
        expect(isValidFret(0, 18)).toBe(true);
        expect(isValidFret(12, 18)).toBe(true);
        expect(isValidFret(18, 18)).toBe(true);
    });

    it('rejects frets out of bounds', () => {
        expect(isValidFret(-1, 18)).toBe(false);
        expect(isValidFret(19, 18)).toBe(false);
        expect(isValidFret(2.5, 18)).toBe(false);
    });
});

describe('PracticeNoteHandler', () => {
    let handler: PracticeNoteHandler;

    beforeEach(() => {
        handler = new PracticeNoteHandler({
            minConfidence: 0.5,
            minRms: 0.005,
            debounceMs: 200
        });
    });

    const createEvent = (overrides: Partial<EngineNoteEvent> = {}): EngineNoteEvent => ({
        midi: 64,
        noteName: 'E4',
        isOnset: true,
        accepted: true,
        rms: 0.02,
        pitchConfidence: 0.85,
        ...overrides
    });

    it('accepts confident onset plucks', () => {
        const result = handler.processEvent(createEvent({ midi: 64, isOnset: true }), 1000);
        expect(result).toBe(64);
    });

    it('rejects events with low confidence or low RMS', () => {
        expect(handler.processEvent(createEvent({ pitchConfidence: 0.3 }), 1000)).toBeNull();
        expect(handler.processEvent(createEvent({ rms: 0.001 }), 1000)).toBeNull();
    });

    it('requires at least 2 consecutive frames if not an onset', () => {
        // Frame 1 without onset -> not ready yet
        expect(handler.processEvent(createEvent({ midi: 60, isOnset: false }), 1000)).toBeNull();
        // Frame 2 with same midi -> stable note emitted
        expect(handler.processEvent(createEvent({ midi: 60, isOnset: false }), 1020)).toBe(60);
    });

    it('debounces duplicate triggers within debounce window', () => {
        // First pluck
        expect(handler.processEvent(createEvent({ midi: 64, isOnset: true }), 1000)).toBe(64);

        // Immediate subsequent frame of same note
        expect(handler.processEvent(createEvent({ midi: 64, isOnset: true }), 1100)).toBeNull();

        // Pluck after debounce window passes
        expect(handler.processEvent(createEvent({ midi: 64, isOnset: true }), 1250)).toBe(64);
    });

    it('allows a different note immediately without waiting for debounce', () => {
        expect(handler.processEvent(createEvent({ midi: 64, isOnset: true }), 1000)).toBe(64);
        expect(handler.processEvent(createEvent({ midi: 67, isOnset: true }), 1050)).toBe(67);
    });

    it('resets state properly on demand', () => {
        expect(handler.processEvent(createEvent({ midi: 64, isOnset: true }), 1000)).toBe(64);
        handler.reset();
        // After reset, even at same timestamp, it can trigger again
        expect(handler.processEvent(createEvent({ midi: 64, isOnset: true }), 1010)).toBe(64);
    });
});
