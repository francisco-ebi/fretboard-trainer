import { describe, it, expect } from 'vitest';
import { FeatureExtractionLoop } from './feature-extraction-loop';
import { FEATURE_POSITIONS, type AudioBackend } from './worklet-types';

const BUFFER_SIZE = 2048;

class FakeBackend implements AudioBackend {
    name = 'fake';
    calls = 0;
    private dropFirst: number;
    // return null for the first `dropFirst` calls (simulates gating failures)
    constructor(dropFirst = 0) {
        this.dropFirst = dropFirst;
    }
    async init() {}
    process(_buffer: Float32Array): Float32Array | null {
        this.calls++;
        if (this.calls <= this.dropFirst) return null;
        const features = new Float32Array(FEATURE_POSITIONS.TOTAL_FEATURES);
        features[FEATURE_POSITIONS.PITCH] = 130.8;
        return features;
    }
}

function makeLoop(backend: AudioBackend) {
    const frames: Float32Array[] = [];
    const loop = new FeatureExtractionLoop(backend, f => { frames.push(Float32Array.from(f)); return true; }, BUFFER_SIZE);
    return { loop, frames };
}

const loud = (n: number) => new Float32Array(n).fill(0.1);
const silent = (n: number) => new Float32Array(n).fill(0.0005);

describe('FeatureExtractionLoop', () => {
    it('produces one frame per hop once a full window accumulates', () => {
        const { loop, frames } = makeLoop(new FakeBackend());
        loop.pushSamples(loud(BUFFER_SIZE)); // first full window → 2 hops? no: exactly one window + overlap
        expect(frames.length).toBe(1);
        loop.pushSamples(loud(BUFFER_SIZE / 2)); // one more hop
        expect(frames.length).toBe(2);
        loop.pushSamples(loud(BUFFER_SIZE)); // two more hops
        expect(frames.length).toBe(4);
    });

    it('handles odd chunk sizes (worker drains variable amounts)', () => {
        const { loop, frames } = makeLoop(new FakeBackend());
        let pushed = 0;
        while (pushed < BUFFER_SIZE * 3) {
            loop.pushSamples(loud(300));
            pushed += 300;
        }
        // 6144 samples → floor((6144 - 2048) / 1024) + 1 = 5 windows
        expect(frames.length).toBe(5);
    });

    it('emits nothing for silence', () => {
        const { loop, frames } = makeLoop(new FakeBackend());
        loop.pushSamples(silent(BUFFER_SIZE * 4));
        expect(frames.length).toBe(0);
    });

    it('sets RMS, SNR and flags the first frame of a pluck as onset', () => {
        const { loop, frames } = makeLoop(new FakeBackend());
        loop.pushSamples(silent(BUFFER_SIZE * 2)); // converge gate floor
        loop.pushSamples(loud(BUFFER_SIZE * 2)); // pluck
        expect(frames.length).toBeGreaterThanOrEqual(2);
        expect(frames[0][FEATURE_POSITIONS.ONSET]).toBe(1);
        expect(frames[1][FEATURE_POSITIONS.ONSET]).toBe(0);
        expect(frames[0][FEATURE_POSITIONS.RMS]).toBeCloseTo(0.1, 3);
        expect(frames[0][FEATURE_POSITIONS.SNR]).toBeGreaterThan(0);
    });

    it('carries a pending onset across backend-dropped frames', () => {
        const backend = new FakeBackend(1); // drop the attack frame
        const { loop, frames } = makeLoop(backend);
        loop.pushSamples(silent(BUFFER_SIZE * 2));
        loop.pushSamples(loud(BUFFER_SIZE * 2));
        expect(backend.calls).toBeGreaterThanOrEqual(2);
        // First delivered frame still announces the pluck
        expect(frames[0][FEATURE_POSITIONS.ONSET]).toBe(1);
    });

    it('waits for the backend to become ready', () => {
        let ready = false;
        const collected: Float32Array[] = [];
        const loop = new FeatureExtractionLoop(new FakeBackend(), f => { collected.push(f); return true; }, BUFFER_SIZE, () => ready);
        loop.pushSamples(loud(BUFFER_SIZE));
        expect(collected.length).toBe(0);
        ready = true;
        loop.pushSamples(loud(BUFFER_SIZE));
        expect(collected.length).toBeGreaterThan(0);
    });
});
