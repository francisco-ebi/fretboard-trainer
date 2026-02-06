import type { DatasetEntry } from "@/utils/audio/recording-engine";
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

const SEQUENCE_LENGTH = 5;
const NUM_FEATURES = 17;

export function prepare3DDataset(allDatasets: { label: number, frames: number[][] }[]) {
    const inputs: number[][][] = [];
    const labels: number[] = [];

    for (const dataset of allDatasets) {
        const rawFrames = dataset.frames;
        const label = dataset.label;
        for (let i = 0; i <= rawFrames.length - SEQUENCE_LENGTH; i++) {
            const window = rawFrames.slice(i, i + SEQUENCE_LENGTH);
            if (window.length === SEQUENCE_LENGTH) {
                inputs.push(window);
                labels.push(label);
            }
        }
    }

    return {
        x: tf.tensor3d(inputs, [inputs.length, SEQUENCE_LENGTH, NUM_FEATURES]),
        y: tf.tensor1d(labels, 'int32')
    };
}