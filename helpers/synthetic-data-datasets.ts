import dataset from './guitar_dataset.json';
import { writeFile } from "fs/promises"

const FEATURE_CONFIG = {
    MFCC_COUNT: 13,
    EXTRA_FEATURES: 2, // Centroid, Rolloff,
    TOTAL_FEATURES: 16 // 13 MFCC + 1 Note + 2 Spectral
};

interface DatasetEntry {
    mfcc: number[][];
    midiNote: number;
    stringNum: number;
    noteName: string;
    features: number[][];
    normalizedFeatures: number[][];
}

function normalizeDataset(data: DatasetEntry[], stats: any): DatasetEntry[] {
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

function calculateStatistics(data: DatasetEntry[]): any {
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

async function main() {
    const data = (dataset as DatasetEntry[]);
    console.log('STARTED');
    const updatedDatasets = (data).map(d => {
        const updatedFeatures = d.features.map(frame => {
            const brightnessPerNote = (frame[13] / frame[14] || 1) || 0;
            frame.push(brightnessPerNote);
            return frame;
        })
        return { ...d, features: updatedFeatures }
    });
    console.log('UPDATED ALL');
    const stats = calculateStatistics(updatedDatasets);
    const normalizedDataset = normalizeDataset(updatedDatasets, stats)
    await writeFile('./synthetic_guitar_dataset.json', JSON.stringify(normalizedDataset));
    await writeFile('./syntethic_guitar_dataset_stats.json', JSON.stringify(stats));

}

main().catch(console.error);
