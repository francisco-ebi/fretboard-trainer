import { describe, it, expect } from 'vitest';
import { prepareStratifiedSplit, SEQUENCE_LENGTH, NUM_FEATURES } from './dataset-preparation';
import type { DatasetEntry } from './recording-engine';

const NUM_CLASSES = 6;

// Each frame encodes its entry id in feature 0 so tests can verify that a
// sample never mixes frames from two different entries.
function makeEntry(entryId: number, stringNum: number): DatasetEntry {
    const frames = Array.from({ length: SEQUENCE_LENGTH }, (_, frameIdx) => {
        const frame = new Array(NUM_FEATURES).fill(0);
        frame[0] = entryId;
        frame[1] = frameIdx;
        return frame;
    });
    return {
        midiNote: 48,
        stringNum,
        noteName: 'C3',
        features: frames,
        normalizedFeatures: frames
    };
}

function makeDataset(countsPerClass: number[]): DatasetEntry[] {
    const entries: DatasetEntry[] = [];
    countsPerClass.forEach((count, stringNum) => {
        for (let i = 0; i < count; i++) {
            entries.push(makeEntry(entries.length, stringNum));
        }
    });
    return entries;
}

describe('prepareStratifiedSplit', () => {
    // Ordered by class like the real captured dataset (the ordering that broke validationSplit)
    const counts = [30, 25, 40, 35, 20, 50];
    const total = counts.reduce((a, b) => a + b, 0);

    it('produces exactly one sample per entry with shape [N, 5, 18]', () => {
        const { trainX, trainY, valX, valY } = prepareStratifiedSplit(makeDataset(counts));

        expect(trainX.shape[0] + valX.shape[0]).toBe(total);
        expect(trainX.shape.slice(1)).toEqual([SEQUENCE_LENGTH, NUM_FEATURES]);
        expect(valX.shape.slice(1)).toEqual([SEQUENCE_LENGTH, NUM_FEATURES]);
        expect(trainY.shape[0]).toBe(trainX.shape[0]);
        expect(valY.shape[0]).toBe(valX.shape[0]);
    });

    it('stratifies validation: every class present at ~valFraction of its size', () => {
        const { valY, trainY } = prepareStratifiedSplit(makeDataset(counts), 0.2);

        const valLabels = valY.arraySync() as number[];
        const trainLabels = trainY.arraySync() as number[];

        for (let label = 0; label < NUM_CLASSES; label++) {
            const valCount = valLabels.filter(l => l === label).length;
            const trainCount = trainLabels.filter(l => l === label).length;
            expect(valCount).toBe(Math.round(counts[label] * 0.2));
            expect(valCount + trainCount).toBe(counts[label]);
        }
    });

    it('never mixes frames from different entries within one sample', () => {
        const { trainX, valX } = prepareStratifiedSplit(makeDataset(counts));

        for (const samples of [trainX.arraySync(), valX.arraySync()]) {
            for (const sample of samples as number[][][]) {
                const entryId = sample[0][0];
                sample.forEach((frame, frameIdx) => {
                    expect(frame[0]).toBe(entryId);
                    expect(frame[1]).toBe(frameIdx);
                });
            }
        }
    });

    it('does not leak entries between train and validation', () => {
        const { trainX, valX } = prepareStratifiedSplit(makeDataset(counts));

        const trainIds = new Set((trainX.arraySync() as number[][][]).map(s => s[0][0]));
        const valIds = new Set((valX.arraySync() as number[][][]).map(s => s[0][0]));

        expect(trainIds.size + valIds.size).toBe(total);
        for (const id of valIds) {
            expect(trainIds.has(id)).toBe(false);
        }
    });

    it('is deterministic for the same seed', () => {
        const a = prepareStratifiedSplit(makeDataset(counts), 0.2, 7);
        const b = prepareStratifiedSplit(makeDataset(counts), 0.2, 7);

        expect(a.trainY.arraySync()).toEqual(b.trainY.arraySync());
        expect(a.valY.arraySync()).toEqual(b.valY.arraySync());
        expect(a.trainX.arraySync()).toEqual(b.trainX.arraySync());
    });

    it('skips entries without normalized [5, 18] sequences', () => {
        const entries = makeDataset([4, 4, 4, 4, 4, 4]);
        entries[0] = { ...entries[0], normalizedFeatures: [] };
        entries[1] = { ...entries[1], normalizedFeatures: [[1, 2, 3]] };

        const { trainX, valX } = prepareStratifiedSplit(entries);
        expect(trainX.shape[0] + valX.shape[0]).toBe(entries.length - 2);
    });
});
