import * as tf from '@tensorflow/tfjs';
import type { DatasetEntry } from './engine';
import dataset from './guitar_dataset.json';

function createModel() {
    const model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [14], units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 6, activation: 'softmax' }));
    model.compile({
        optimizer: tf.train.adam(0.01),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
    });
    console.log('Model created');
    return model;
}

export async function trainModel() {
    console.log('Training model...');
    const data = dataset as DatasetEntry[];
    const model = createModel();
    const inputTensor = tf.tensor2d(data.map(d => d.normalizedFeatures));
    const labelsTensor = tf.tensor1d(data.map(d => d.stringNum), 'int32');
    const outputTensor = tf.oneHot(labelsTensor, 6);
    await model.fit(inputTensor, outputTensor, {
        epochs: 50,
        batchSize: 32,
        shuffle: true,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                console.log(`Epoch ${epoch}: loss = ${logs?.loss}, accuracy = ${logs?.acc}`);
            }
        }
    });
    console.log('Training completed');
    await model.save('downloads://guitar-model');
    return model;
}