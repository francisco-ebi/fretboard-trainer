import type { DatasetEntry } from "./engine";

interface Statistics {
    mean: number[];
    std: number[];
}

export function calculateStatistics(data: DatasetEntry[]): Statistics {
    const numFeatures = data[0].features.length;
    const stats = {
        mean: new Array(numFeatures).fill(0),
        std: new Array(numFeatures).fill(0)
    };

    // average calculation
    for (let col = 0; col < numFeatures; col++) {
        const colValues = data.map(row => row.features[col]);
        const sum = colValues.reduce((a, b) => a + b, 0);
        stats.mean[col] = sum / colValues.length;
    }

    // standard deviation calculation
    for (let col = 0; col < numFeatures; col++) {
        const colValues = data.map(row => row.features[col]);
        const mean = stats.mean[col];
        const sumSqDiff = colValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
        stats.std[col] = Math.sqrt(sumSqDiff / colValues.length);
    }

    return stats;
}

export function normalizeDataset(data: DatasetEntry[], stats: Statistics): DatasetEntry[] {
    return data.map(entry => {
        const normalizedFeatures = entry.features.map((val, i) => {
            return (val - stats.mean[i]) / (stats.std[i] || 1);
        });
        return {
            ...entry,
            normalizedFeatures
        };
    });
}
