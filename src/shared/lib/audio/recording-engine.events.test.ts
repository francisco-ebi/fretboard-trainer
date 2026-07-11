import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FEATURE_POSITIONS } from './worklet-types';
import type { EngineNoteEvent, EngineSequenceEvent } from './recording-engine';

// Fresh engine singleton per test (the autosave store no-ops in jsdom)
beforeEach(() => {
    vi.resetModules();
});

const loadEngine = async () => (await import('./recording-engine')).audioRecordingEngine;

// Synthetic feature frame as the SAB poller would hand to the engine
const makeFrame = (midi: number, onset = false) => {
    const frame = new Float32Array(FEATURE_POSITIONS.TOTAL_FEATURES);
    frame[FEATURE_POSITIONS.PITCH] = 440 * 2 ** ((midi - 69) / 12);
    for (let i = 0; i < 13; i++) frame[FEATURE_POSITIONS.MFCC_START + i] = 0.1;
    frame[FEATURE_POSITIONS.RMS] = 0.2;
    frame[FEATURE_POSITIONS.PITCH_CONFIDENCE] = 0.9;
    frame[FEATURE_POSITIONS.ONSET] = onset ? 1 : 0;
    return frame;
};

describe('recording engine observer events', () => {
    it('emits note events before the range filter and sequence events with onset anchoring', async () => {
        const engine = await loadEngine();
        engine.currentLabel = 5; // low E: MIDI 40–58

        const noteEvents: EngineNoteEvent[] = [];
        const sequenceEvents: EngineSequenceEvent[] = [];
        const legacyCalls: Array<[number, number]> = [];
        engine.onNoteEvent = (event) => noteEvents.push(event);
        engine.onSequenceCaptured = (event) => sequenceEvents.push(event);
        engine.onDataCaptured = (note, count) => legacyCalls.push([note, count]);

        // One pluck: onset frame + 4 decay frames → one onset-anchored sequence
        engine.handleSerializedResult(makeFrame(45, true));
        for (let i = 0; i < 4; i++) engine.handleSerializedResult(makeFrame(45));

        expect(noteEvents).toHaveLength(5);
        expect(noteEvents[0]).toMatchObject({ midi: 45, noteName: 'A2', isOnset: true, accepted: true });
        expect(noteEvents[1].isOnset).toBe(false);

        expect(engine.dataset).toHaveLength(1);
        expect(sequenceEvents).toHaveLength(1);
        expect(sequenceEvents[0]).toMatchObject({
            midi: 45,
            noteName: 'A2',
            stringNum: 5,
            isOnsetAnchored: true,
            datasetLength: 1
        });
        // Legacy callback untouched (UI counter + protocol §2 console check)
        expect(legacyCalls).toEqual([[45, 1]]);

        // Decay-only frames → a second sequence that is NOT onset-anchored
        for (let i = 0; i < 5; i++) engine.handleSerializedResult(makeFrame(45));
        expect(sequenceEvents).toHaveLength(2);
        expect(sequenceEvents[1].isOnsetAnchored).toBe(false);
    });

    it('reports rejected frames as accepted: false and saves nothing', async () => {
        const engine = await loadEngine();
        engine.currentLabel = 0; // high E: MIDI 64–82

        const noteEvents: EngineNoteEvent[] = [];
        const sequenceEvents: EngineSequenceEvent[] = [];
        engine.onNoteEvent = (event) => noteEvents.push(event);
        engine.onSequenceCaptured = (event) => sequenceEvents.push(event);

        for (let i = 0; i < 5; i++) engine.handleSerializedResult(makeFrame(45, i === 0)); // A2, out of range

        expect(noteEvents).toHaveLength(5);
        expect(noteEvents.every((event) => !event.accepted)).toBe(true);
        expect(engine.dataset).toHaveLength(0);
        expect(sequenceEvents).toHaveLength(0);
    });
});
