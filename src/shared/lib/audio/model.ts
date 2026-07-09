import type { DatasetEntry } from '@/shared/lib/audio/recording-engine';
// import * as tf from '@tensorflow/tfjs';
import type { LayersModel } from '@tensorflow/tfjs';
import { fetchDataset } from './dataset-loader';
import { calculateStatistics, prepareStratifiedSplit, prepareLeaveOneGuitarOutSplit, SEQUENCE_LENGTH, NUM_FEATURES } from './dataset-preparation';
import { PIPELINE_VERSIONS } from './worklet-types';
import type { ModelManifestEntry } from './model-manifest';

const MODEL_NAME = 'guitar-essentia-acoustic-ts';

function downloadJSON(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function getTiF() {
    return await import('@tensorflow/tfjs');
}

export async function createModel(): Promise<LayersModel> {
    const tf = await getTiF();
    const model = tf.sequential();
    model.add(tf.layers.conv1d({ inputShape: [SEQUENCE_LENGTH, NUM_FEATURES], filters: 32, kernelSize: 3, activation: "relu" }));
    model.add(tf.layers.globalAveragePooling1d());
    // model.add(tf.layers.flatten());
    // model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 6, activation: 'softmax' }));
    model.compile({
        optimizer: "adam",
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
    });
    console.log('Model created');
    return model;
}

export interface TrainOptions {
    // Leave-one-guitar-out experiment (protocol §7): validate on the
    // sequences carrying this provenance tag, train on everything else.
    // Measures cross-guitar generalization; the result is not for deployment.
    holdOutGuitarId?: string;
}

export async function trainModel(data: DatasetEntry[] = [], options: TrainOptions = {}) { // Keep data optional for now
    console.log('Training model...');
    const tf = await getTiF();

    // Mock data if empty for testing
    if (data.length === 0) {
        console.warn("No data provided for training, fetching default dataset.");
        data = await fetchDataset<DatasetEntry[]>('essentia-acoustic-ts/guitar_dataset.json');
    }

    const model = await createModel();
    const holdOut = options.holdOutGuitarId?.trim();
    if (holdOut) {
        console.log(`Leave-one-guitar-out split: validating on "${holdOut}", training on the rest`);
    }
    const { trainX, trainY, valX, valY } = holdOut
        ? prepareLeaveOneGuitarOutSplit(data, holdOut)
        : prepareStratifiedSplit(data);
    const trainYHot = tf.oneHot(trainY, 6);
    const valYHot = tf.oneHot(valY, 6);
    console.log(`Train Shape: ${trainX.shape} | Validation Shape: ${valX.shape}`);

    const earlyStopping = tf.callbacks.earlyStopping({
        monitor: 'val_acc',
        patience: 5,
        minDelta: 0.005
    });


    await model.fit(trainX, trainYHot, {
        epochs: 100,
        batchSize: 64,
        shuffle: true,
        validationData: [valX, valYHot],
        callbacks: [
            earlyStopping,
            new tf.CustomCallback({
                onEpochEnd: (epoch, logs) => {
                    console.log(`Epoch ${epoch + 1}: Precisión Entrenamiento = ${(logs!.acc * 100).toFixed(1)}% | Precisión Validación = ${(logs!.val_acc * 100).toFixed(1)}%`);
                }
            })
        ]
    });
    console.log('Training completed');
    await model.save(`downloads://${MODEL_NAME}`);

    // Ready-to-paste manifest entry: the stats are recomputed from the same
    // raw features the dataset was normalized with, so model + stats ship as
    // one artifact and can never get unpaired.
    const manifestEntry: ModelManifestEntry = {
        model: `${MODEL_NAME}.json`,
        backend: 'essentia',
        numFeatures: NUM_FEATURES,
        sequenceLength: SEQUENCE_LENGTH,
        pipelineVersion: PIPELINE_VERSIONS.essentia,
        trainedAt: new Date().toISOString(),
        datasetSize: data.length,
        ...(holdOut ? { notes: `LOGO experiment: validated on held-out guitar "${holdOut}" — for measurement, not deployment` } : {}),
        stats: calculateStatistics(data)
    };
    downloadJSON(manifestEntry, `manifest-entry-${MODEL_NAME}.json`);
    console.log('Manifest entry downloaded — paste it under modes.precision in public/model/manifest.json');

    return model;
}