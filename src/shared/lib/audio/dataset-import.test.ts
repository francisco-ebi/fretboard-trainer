import { describe, it, expect } from 'vitest';
import { parseDatasetFile } from './dataset-import';
import { SEQUENCE_LENGTH, NUM_FEATURES } from './dataset-preparation';

const frame = (fill = 0.5) => new Array(NUM_FEATURES).fill(fill);
const frames = (fill = 0.5) => Array.from({ length: SEQUENCE_LENGTH }, () => frame(fill));

const validEntry = (overrides: Record<string, unknown> = {}) => ({
    midiNote: 55,
    stringNum: 2,
    noteName: 'G3',
    features: frames(),
    normalizedFeatures: frames(9), // stale z-scores from the source session
    ...overrides
});

describe('parseDatasetFile', () => {
    it('parses a downloaded dataset and discards the stale per-session normalization', () => {
        const entries = parseDatasetFile([validEntry(), validEntry({ stringNum: 5, midiNote: 40, noteName: 'E2' })]);
        expect(entries).toHaveLength(2);
        expect(entries[0].features).toHaveLength(SEQUENCE_LENGTH);
        expect(entries[0].normalizedFeatures).toEqual([]);
        expect(entries[1].stringNum).toBe(5);
    });

    it('accepts files whose entries carry no normalizedFeatures at all', () => {
        const raw = validEntry();
        delete (raw as Record<string, unknown>).normalizedFeatures;
        expect(parseDatasetFile([raw])).toHaveLength(1);
    });

    it('preserves the guitarId provenance tag and leaves untagged entries untagged', () => {
        const entries = parseDatasetFile([validEntry({ guitarId: 'strat-10s' }), validEntry()]);
        expect(entries[0].guitarId).toBe('strat-10s');
        expect('guitarId' in entries[1]).toBe(false);
    });

    it('rejects a blank guitarId (would silently merge groups)', () => {
        expect(() => parseDatasetFile([validEntry({ guitarId: '  ' })])).toThrow(/guitarId/);
        expect(() => parseDatasetFile([validEntry({ guitarId: 42 })])).toThrow(/guitarId/);
    });

    it('recognizes a stats file and names the right file of the pair', () => {
        expect(() => parseDatasetFile({ mean: [0, 1], std: [1, 1] }))
            .toThrow(/stats file/);
    });

    it('rejects non-array and empty payloads', () => {
        expect(() => parseDatasetFile('nope')).toThrow(/JSON array/);
        expect(() => parseDatasetFile(null)).toThrow(/JSON array/);
        expect(() => parseDatasetFile([])).toThrow(/no sequences/);
    });

    it('rejects out-of-range or fractional string labels', () => {
        expect(() => parseDatasetFile([validEntry({ stringNum: 6 })])).toThrow(/stringNum/);
        expect(() => parseDatasetFile([validEntry({ stringNum: -1 })])).toThrow(/stringNum/);
        expect(() => parseDatasetFile([validEntry({ stringNum: 2.5 })])).toThrow(/stringNum/);
    });

    it('rejects sequences with the wrong frame count', () => {
        expect(() => parseDatasetFile([validEntry({ features: frames().slice(1) })]))
            .toThrow(new RegExp(`${SEQUENCE_LENGTH} frames`));
    });

    it('rejects frames from a different feature pipeline', () => {
        const short = frames();
        short[3] = short[3].slice(0, NUM_FEATURES - 1);
        expect(() => parseDatasetFile([validEntry({ features: short })]))
            .toThrow(new RegExp(`${NUM_FEATURES} values`));
    });

    it('rejects nulls inside frames (NaN features serialize to null)', () => {
        const poisoned = frames();
        poisoned[2][7] = null as unknown as number;
        expect(() => parseDatasetFile([validEntry(), validEntry({ features: poisoned })]))
            .toThrow(/entry 1: frame 2\[7\]/);
    });
});
