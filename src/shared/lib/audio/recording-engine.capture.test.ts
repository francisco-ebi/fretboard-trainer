import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NUM_FEATURES } from './dataset-preparation';
import type { AnalysisResult } from './worklet-types';

// Fresh engine singleton per test (the autosave store no-ops in jsdom)
beforeEach(() => {
    vi.resetModules();
});

const loadEngine = async () => (await import('./recording-engine')).audioRecordingEngine;

const mfcc = new Array(13).fill(0.1);
const extraFeatures: Partial<AnalysisResult> = {
    spectralCentroid: 0.4,
    spectralFlux: 0.05,
    spectralRolloff: 2200,
    inharmonicity: 0.01,
    rms: 0.2,
    inharmonicityB: -4.2,
    isOnset: false,
    snr: 1.1,
    harmonicsDb: [-6, -9, -12, -14, -60, -60, -60],
    tristimulus: [0.4, 0.4, 0.2],
    oddEvenRatio: -0.3
};

describe('recording engine capture provenance', () => {
    it('stamps the current guitar tag onto captured sequences', async () => {
        const engine = await loadEngine();
        engine.guitarId = '  strat-10s  '; // UI passes raw input; stamp is trimmed

        for (let i = 0; i < 5; i++) engine.saveData(mfcc, 55, extraFeatures);

        expect(engine.dataset).toHaveLength(1);
        expect(engine.dataset[0].guitarId).toBe('strat-10s');
        expect(engine.dataset[0].features[0]).toHaveLength(NUM_FEATURES);
    });

    it('leaves sequences untagged when no guitar tag is set', async () => {
        const engine = await loadEngine();

        for (let i = 0; i < 5; i++) engine.saveData(mfcc, 55, extraFeatures);

        expect(engine.dataset).toHaveLength(1);
        expect(engine.dataset[0].guitarId).toBeUndefined();
    });
});
