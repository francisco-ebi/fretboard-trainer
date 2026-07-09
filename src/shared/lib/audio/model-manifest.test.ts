import { describe, it, expect } from 'vitest';
import { validateManifestEntry, validateModelShape, type ModelManifestEntry } from './model-manifest';

const entry = (overrides: Partial<ModelManifestEntry> = {}): ModelManifestEntry => ({
    model: 'guitar-test.json',
    backend: 'essentia',
    numFeatures: 22,
    sequenceLength: 5,
    pipelineVersion: 2,
    stats: { mean: new Array(22).fill(0), std: new Array(22).fill(1) },
    ...overrides,
});

const expected = { numFeatures: 22, sequenceLength: 5, pipelineVersion: 2 };

describe('validateManifestEntry', () => {
    it('passes a consistent entry', () => {
        const result = validateManifestEntry(entry(), expected);
        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
    });

    it('errors on missing stats', () => {
        const broken = entry({ stats: undefined as any });
        expect(validateManifestEntry(broken, expected).errors).toHaveLength(1);
    });

    it('errors when stats dimensions disagree with numFeatures', () => {
        const broken = entry({ stats: { mean: new Array(18).fill(0), std: new Array(18).fill(1) } });
        const result = validateManifestEntry(broken, expected);
        expect(result.errors.some(e => e.includes('stats dimensions'))).toBe(true);
    });

    it('errors when the model feature count does not match the pipeline', () => {
        const stale = entry({
            numFeatures: 18,
            stats: { mean: new Array(18).fill(0), std: new Array(18).fill(1) },
        });
        const result = validateManifestEntry(stale, expected);
        expect(result.errors.some(e => e.includes('retrain'))).toBe(true);
    });

    it('errors on sequence length mismatch', () => {
        const broken = entry({ sequenceLength: 10 });
        expect(validateManifestEntry(broken, expected).errors.some(e => e.includes('sequences'))).toBe(true);
    });

    it('only warns on pipeline version drift', () => {
        const older = entry({ pipelineVersion: 1 });
        const result = validateManifestEntry(older, expected);
        expect(result.errors).toEqual([]);
        expect(result.warnings).toHaveLength(1);
    });
});

describe('validateModelShape', () => {
    it('accepts the matching shape', () => {
        expect(validateModelShape([null, 5, 22], entry())).toBeNull();
    });

    it('rejects wrong dimensions', () => {
        expect(validateModelShape([null, 5, 18], entry())).toContain('does not match');
        expect(validateModelShape([null, 10, 22], entry())).toContain('does not match');
    });

    it('rejects wrong rank', () => {
        expect(validateModelShape([null, 22], entry())).toContain('rank');
    });
});
