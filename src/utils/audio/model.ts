import type { DatasetEntry } from '@/utils/audio/recording-engine';
// import * as tf from '@tensorflow/tfjs';
import type { LayersModel } from '@tensorflow/tfjs';
import dataset from '@/utils/audio/datasets/meyda-timeseries/guitar_dataset.json';
import { prepare3DDataset, groupDataByString } from './dataset-preparation';

async function getTiF() {
    return await import('@tensorflow/tfjs');
}

export async function createModel(): Promise<LayersModel> {
    const tf = await getTiF();
    const model = tf.sequential();
    model.add(tf.layers.lstm({ inputShape: [5, 16], units: 64, returnSequences: false }));
    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 6, activation: 'softmax' }));
    model.compile({
        optimizer: tf.train.adam(0.01),
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
        console.warn("No data provided for training, using default dataset.");
        data = dataset as unknown as DatasetEntry[];
    }

    const model = await createModel();
    const { x, y } = prepare3DDataset(groupDataByString(data));
    const yHot = tf.oneHot(y, 6);
    console.log(`Input Shape: ${x.shape}`);


    await model.fit(x, yHot, {
        epochs: 30,
        batchSize: 32,
        shuffle: true,
        validationSplit: 0.2,
        callbacks: {
            onEpochEnd: (epoch, logs) => console.log(`Epoch ${epoch}: loss=${logs?.loss}, accuracy = ${logs?.acc}`)
        }
    });
    console.log('Training completed');
    // Save model
    // await model.save('downloads://guitar-model');
    // For browser download:

    await model.save('downloads://guitar-essentia-model');

    return model;
}