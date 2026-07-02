import type { DatasetEntry } from '@/shared/lib/audio/recording-engine';
// import * as tf from '@tensorflow/tfjs';
import type { LayersModel } from '@tensorflow/tfjs';
import { fetchDataset } from './dataset-loader';
import { prepareStratifiedSplit } from './dataset-preparation';

async function getTiF() {
    return await import('@tensorflow/tfjs');
}

export async function createModel(): Promise<LayersModel> {
    const tf = await getTiF();
    const model = tf.sequential();
    model.add(tf.layers.conv1d({ inputShape: [5, 18], filters: 32, kernelSize: 3, activation: "relu" }));
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

export async function trainModel(data: DatasetEntry[] = []) { // Keep data optional for now
    console.log('Training model...');
    const tf = await getTiF();

    // Mock data if empty for testing
    if (data.length === 0) {
        console.warn("No data provided for training, fetching default dataset.");
        data = await fetchDataset<DatasetEntry[]>('essentia-acoustic-ts/guitar_dataset.json');
    }

    const model = await createModel();
    const { trainX, trainY, valX, valY } = prepareStratifiedSplit(data);
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
    await model.save('downloads://guitar-essentia-acoustic-ts');

    return model;
}