import type { DatasetEntry } from "@/shared/lib/audio/recording-engine";
import * as tf from '@tensorflow/tfjs';

interface Statistics {
    mean: number[];
    std: number[];
}



export function calculateStatistics(data: DatasetEntry[]): Statistics {
    if (data.length === 0) return { mean: [], std: [] };

    // Check dimensions. Now features is number[][] (time x features)
    // We assume all sequences have same inner feature dimension
    const numFeatures = data[0].features[0].length;
    const stats = {
        mean: new Array(numFeatures).fill(0),
        std: new Array(numFeatures).fill(0)
    };

    // Flatten all frames from all sequences into a single pool for stats
    const allFrames = data.flatMap(entry => entry.features);

    // average calculation
    for (let col = 0; col < numFeatures; col++) {
        const colValues = allFrames.map(frame => frame[col]);
        const sum = colValues.reduce((a, b) => a + b, 0);
        stats.mean[col] = sum / colValues.length;
    }

    // standard deviation calculation
    for (let col = 0; col < numFeatures; col++) {
        const colValues = allFrames.map(frame => frame[col]);
        const mean = stats.mean[col];
        const sumSqDiff = colValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
        stats.std[col] = Math.sqrt(sumSqDiff / colValues.length);
    }

    return stats;
}

export function normalizeDataset(data: DatasetEntry[], stats: Statistics): DatasetEntry[] {
    return data.map(entry => {
        // Normalize each frame in the sequence
        const normalizedFeatures = entry.features.map(frame => {
            return frame.map((val, i) => {
                return (val - stats.mean[i]) / (stats.std[i] || 1);
            });
        });

        return {
            ...entry,
            normalizedFeatures
        };
    });
}

export function groupDataByString(data: DatasetEntry[]) {
    const groups: Record<number, number[][]> = {};

    for (const entry of data) {
        if (!groups[entry.stringNum]) {
            groups[entry.stringNum] = [];
        }
        groups[entry.stringNum].push(...entry.normalizedFeatures);
    }

    return Object.keys(groups).map(key => ({
        label: Number(key),
        frames: groups[Number(key)]
    }));
}

export const SEQUENCE_LENGTH = 5;
// 13 MFCC + note + centroid + flux + rolloff + inharmonicity + rms + log10(B)
// + onset + snr + 7 partial dB ratios + 3 tristimulus + odd/even ratio
export const NUM_FEATURES = 33;

function mulberry32(seed: number) {
    return function () {
        let t = (seed += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffleInPlace<T>(items: T[], random: () => number) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
}

export interface StratifiedSplit {
    trainX: tf.Tensor3D;
    trainY: tf.Tensor1D;
    valX: tf.Tensor3D;
    valY: tf.Tensor1D;
}

interface LabeledSequence {
    sequence: number[][];
    label: number;
}

// Entries recorded with an older feature pipeline don't match the current
// [SEQUENCE_LENGTH, NUM_FEATURES] shape and are skipped by both splits
const hasCurrentShape = (entry: DatasetEntry): boolean =>
    entry.normalizedFeatures.length === SEQUENCE_LENGTH &&
    !entry.normalizedFeatures.some(frame => frame.length !== NUM_FEATURES);

function buildSplitTensors(train: LabeledSequence[], val: LabeledSequence[]): StratifiedSplit {
    return {
        trainX: tf.tensor3d(train.map(s => s.sequence), [train.length, SEQUENCE_LENGTH, NUM_FEATURES]),
        trainY: tf.tensor1d(train.map(s => s.label), 'int32'),
        valX: tf.tensor3d(val.map(s => s.sequence), [val.length, SEQUENCE_LENGTH, NUM_FEATURES]),
        valY: tf.tensor1d(val.map(s => s.label), 'int32')
    };
}

// Each DatasetEntry is one recorded sequence and becomes exactly one sample;
// windows never mix frames from different recordings. The validation set is
// stratified per string so every class is represented at valFraction.
export function prepareStratifiedSplit(data: DatasetEntry[], valFraction = 0.2, seed = 42): StratifiedSplit {
    const byLabel: Record<number, number[][][]> = {};
    for (const entry of data) {
        if (!hasCurrentShape(entry)) continue;
        (byLabel[entry.stringNum] ??= []).push(entry.normalizedFeatures);
    }

    if (Object.keys(byLabel).length === 0) {
        throw new Error(
            `prepareStratifiedSplit: no sequences with shape [${SEQUENCE_LENGTH}, ${NUM_FEATURES}] found. ` +
            `The dataset was likely recorded with an older feature pipeline — re-record it with the current one.`
        );
    }

    const random = mulberry32(seed);
    const train: LabeledSequence[] = [];
    const val: LabeledSequence[] = [];

    for (const key of Object.keys(byLabel)) {
        const label = Number(key);
        const sequences = byLabel[label];
        shuffleInPlace(sequences, random);
        const valCount = Math.round(sequences.length * valFraction);
        sequences.forEach((sequence, i) => {
            (i < valCount ? val : train).push({ sequence, label });
        });
    }

    shuffleInPlace(train, random);

    return buildSplitTensors(train, val);
}

// Grouping key for entries without a provenance tag (pre-tag datasets)
export const UNTAGGED_GUITAR = 'untagged';

export const guitarIdOf = (entry: DatasetEntry): string =>
    entry.guitarId?.trim() || UNTAGGED_GUITAR;

// Leave-one-guitar-out split for cross-guitar generalization experiments
// (recording protocol §7): train on every other guitar, validate on the
// held-out one. The stratified split cannot answer "does this work on an
// unseen guitar" — with pooled data it validates on instruments the model
// has already seen. Known caveat: normalizedFeatures were z-scored at
// download time with pool-wide stats, so a sliver of the held-out guitar
// leaks into normalization — second-order next to what this measures.
export function prepareLeaveOneGuitarOutSplit(data: DatasetEntry[], heldOutGuitarId: string, seed = 42): StratifiedSplit {
    const counts: Record<string, number> = {};
    const train: LabeledSequence[] = [];
    const val: LabeledSequence[] = [];

    for (const entry of data) {
        if (!hasCurrentShape(entry)) continue;
        const group = guitarIdOf(entry);
        counts[group] = (counts[group] || 0) + 1;
        (group === heldOutGuitarId ? val : train).push({
            sequence: entry.normalizedFeatures,
            label: entry.stringNum
        });
    }

    const groups = Object.entries(counts).map(([id, count]) => `"${id}" (${count})`).join(', ') || 'none';
    if (val.length === 0) {
        throw new Error(
            `prepareLeaveOneGuitarOutSplit: no sequences tagged "${heldOutGuitarId}". ` +
            `Guitars in this dataset: ${groups}.`
        );
    }
    if (train.length === 0) {
        throw new Error(
            `prepareLeaveOneGuitarOutSplit: every sequence is tagged "${heldOutGuitarId}" — ` +
            `nothing left to train on. Guitars in this dataset: ${groups}.`
        );
    }

    shuffleInPlace(train, mulberry32(seed));

    return buildSplitTensors(train, val);
}