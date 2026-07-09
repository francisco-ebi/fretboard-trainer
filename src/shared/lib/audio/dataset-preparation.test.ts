import { describe, it, expect } from 'vitest';
import { prepareStratifiedSplit, prepareLeaveOneGuitarOutSplit, UNTAGGED_GUITAR, SEQUENCE_LENGTH, NUM_FEATURES } from './dataset-preparation';
import type { DatasetEntry } from './recording-engine';

const NUM_CLASSES = 6;

// Each frame encodes its entry id in feature 0 so tests can verify that a
// sample never mixes frames from two different entries.
function makeEntry(entryId: number, stringNum: number, guitarId?: string): DatasetEntry {
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
        ...(guitarId !== undefined ? { guitarId } : {}),
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

describe('prepareLeaveOneGuitarOutSplit', () => {
    // Three guitars, all strings covered, unequal sizes
    function makeMultiGuitarDataset(): { entries: DatasetEntry[]; idsByGuitar: Record<string, Set<number>> } {
        const entries: DatasetEntry[] = [];
        const idsByGuitar: Record<string, Set<number>> = {};
        const plan: Array<[string | undefined, number]> = [['strat', 8], ['tele', 5], [undefined, 4]];
        for (const [guitar, perString] of plan) {
            const key = guitar ?? UNTAGGED_GUITAR;
            idsByGuitar[key] = new Set();
            for (let stringNum = 0; stringNum < NUM_CLASSES; stringNum++) {
                for (let i = 0; i < perString; i++) {
                    idsByGuitar[key].add(entries.length);
                    entries.push(makeEntry(entries.length, stringNum, guitar));
                }
            }
        }
        return { entries, idsByGuitar };
    }

    const sampleIds = (x: ReturnType<typeof prepareLeaveOneGuitarOutSplit>['trainX']) =>
        new Set((x.arraySync() as number[][][]).map(s => s[0][0]));

    it('validates on exactly the held-out guitar and trains on the rest', () => {
        const { entries, idsByGuitar } = makeMultiGuitarDataset();
        const { trainX, valX, valY } = prepareLeaveOneGuitarOutSplit(entries, 'tele');

        expect(sampleIds(valX)).toEqual(idsByGuitar['tele']);
        const trainIds = sampleIds(trainX);
        expect(trainIds.size).toBe(idsByGuitar['strat'].size + idsByGuitar[UNTAGGED_GUITAR].size);
        for (const id of idsByGuitar['tele']) expect(trainIds.has(id)).toBe(false);

        // The held-out guitar covers every class, so validation does too
        const valLabels = new Set(valY.arraySync() as number[]);
        expect(valLabels.size).toBe(NUM_CLASSES);
    });

    it('groups entries without a tag under the untagged key', () => {
        const { entries, idsByGuitar } = makeMultiGuitarDataset();
        const { valX } = prepareLeaveOneGuitarOutSplit(entries, UNTAGGED_GUITAR);
        expect(sampleIds(valX)).toEqual(idsByGuitar[UNTAGGED_GUITAR]);
    });

    it('rejects an unknown tag and lists the available guitars', () => {
        const { entries } = makeMultiGuitarDataset();
        expect(() => prepareLeaveOneGuitarOutSplit(entries, 'lespaul'))
            .toThrow(/no sequences tagged "lespaul".*"strat" \(48\).*"tele" \(30\)/s);
    });

    it('rejects a hold-out that leaves nothing to train on', () => {
        const entries = Array.from({ length: 10 }, (_, i) => makeEntry(i, i % NUM_CLASSES, 'strat'));
        expect(() => prepareLeaveOneGuitarOutSplit(entries, 'strat')).toThrow(/nothing left to train on/);
    });

    it('skips malformed entries like the stratified split does', () => {
        const { entries } = makeMultiGuitarDataset();
        entries[0] = { ...entries[0], normalizedFeatures: [] };
        const { trainX, valX } = prepareLeaveOneGuitarOutSplit(entries, 'tele');
        expect(trainX.shape[0] + valX.shape[0]).toBe(entries.length - 1);
    });

    it('is deterministic for the same seed', () => {
        const { entries } = makeMultiGuitarDataset();
        const a = prepareLeaveOneGuitarOutSplit(entries, 'strat', 7);
        const b = prepareLeaveOneGuitarOutSplit(entries, 'strat', 7);
        expect(a.trainX.arraySync()).toEqual(b.trainX.arraySync());
        expect(a.trainY.arraySync()).toEqual(b.trainY.arraySync());
    });
});
