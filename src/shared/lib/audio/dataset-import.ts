import type { DatasetEntry } from '@/shared/lib/audio/recording-engine';
import { SEQUENCE_LENGTH, NUM_FEATURES } from '@/shared/lib/audio/dataset-preparation';

// Parses a previously downloaded dataset file so a multi-day recording can
// resume on top of it (protocol §3.4: pass B on a later day) instead of
// hand-merging two downloaded files.
//
// Shape is validated strictly against the current pipeline (SEQUENCE_LENGTH ×
// NUM_FEATURES): a file recorded under different feature semantics would
// silently poison every stat computed over the union. Stale
// `normalizedFeatures` are dropped: they were z-scored with the *source
// session's* stats, and features offset per session are exactly the session
// fingerprint the recording protocol exists to remove. downloadDataset()
// re-normalizes the merged dataset with stats over the whole pool.

const NUM_CLASSES = 6; // string labels 0..5; trainModel one-hots to 6 classes

export function parseDatasetFile(raw: unknown): DatasetEntry[] {
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
        const stats = raw as { mean?: unknown; std?: unknown };
        if (Array.isArray(stats.mean) && Array.isArray(stats.std)) {
            throw new Error('this is a stats file — select the dataset file of the pair (guitar_dataset_<timestamp>.json)');
        }
    }
    if (!Array.isArray(raw)) throw new Error('dataset must be a JSON array of sequences');
    if (raw.length === 0) throw new Error('dataset file contains no sequences');

    return raw.map((value, index) => {
        // Explicit `never` annotation so TS treats calls as terminating
        const fail: (reason: string) => never = (reason) => {
            throw new Error(`entry ${index}: ${reason}`);
        };

        if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('not an object');
        const entry = value as Record<string, unknown>;

        const midiNote = entry.midiNote;
        if (typeof midiNote !== 'number' || !Number.isFinite(midiNote)) fail('midiNote is not a finite number');

        const stringNum = entry.stringNum;
        if (typeof stringNum !== 'number' || !Number.isInteger(stringNum) || stringNum < 0 || stringNum >= NUM_CLASSES) {
            fail(`stringNum must be an integer 0-${NUM_CLASSES - 1}`);
        }

        const noteName = entry.noteName;
        if (typeof noteName !== 'string' || noteName.length === 0) fail('noteName is missing');

        // Provenance tag is optional (older files are untagged) but when
        // present it must be usable as a grouping key
        const guitarId = entry.guitarId;
        if (guitarId !== undefined && (typeof guitarId !== 'string' || guitarId.trim().length === 0)) {
            fail('guitarId must be a non-empty string when present');
        }

        const features = entry.features;
        if (!Array.isArray(features) || features.length !== SEQUENCE_LENGTH) {
            fail(`features must be ${SEQUENCE_LENGTH} frames, got ${Array.isArray(features) ? features.length : typeof features}`);
        }
        for (let f = 0; f < features.length; f++) {
            const frame: unknown = features[f];
            if (!Array.isArray(frame) || frame.length !== NUM_FEATURES) {
                fail(`frame ${f} must have ${NUM_FEATURES} values, got ${Array.isArray(frame) ? frame.length : typeof frame}`);
            }
            for (let c = 0; c < frame.length; c++) {
                const cell: unknown = frame[c];
                if (typeof cell !== 'number' || !Number.isFinite(cell)) {
                    fail(`frame ${f}[${c}] is not a finite number (NaN features serialize to null in JSON)`);
                }
            }
        }

        return {
            midiNote,
            stringNum,
            noteName,
            ...(guitarId !== undefined ? { guitarId } : {}),
            features: features as number[][],
            normalizedFeatures: [] // stale per-session normalization discarded
        };
    });
}
