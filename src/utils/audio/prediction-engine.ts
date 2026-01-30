import Meyda from 'meyda';
import { YIN } from 'pitchfinder';
import * as tf from '@tensorflow/tfjs';
import statsData from '@/utils/audio/stats.json';
import { normalizeDataset } from '@/utils/audio/dataset-preparation';

import processorUrl from '@/utils/audio/recorder-processor.ts?url';

class GuitarAudioRecordingEngine {
    audioContext: AudioContext | null;
    workletNode: AudioWorkletNode | null;
    detectPitch: ((buffer: Float32Array) => number | null) | null;
    isRecording: boolean;
    onNotePredicted: ((note: number, count: number) => void) | null;
    model: tf.LayersModel | null;

    constructor() {
        this.audioContext = null;
        this.workletNode = null;
        this.detectPitch = null;
        this.isRecording = false;
        this.onNotePredicted = null;
        this.model = null;
    }

    async init() {
        if (this.audioContext) return;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioContextClass();

        if (!this.audioContext) {
            console.error("AudioContext not supported");
            return;
        }
        try {
            await this.audioContext.audioWorklet.addModule(processorUrl);
        } catch (e) {
            console.error("Error loading Worklet. Verify browser support.", e);
            return;
        }

        this.model = await tf.loadLayersModel('/model/guitar-model.json');

        this.detectPitch = YIN({ sampleRate: this.audioContext.sampleRate });

        if (Meyda) {
            Meyda.audioContext = this.audioContext;
            Meyda.bufferSize = 2048;
            Meyda.windowingFunction = "hamming";
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = this.audioContext.createMediaStreamSource(stream);
            this.workletNode = new AudioWorkletNode(this.audioContext, 'recorder-processor');

            this.workletNode.port.onmessage = (event) => {
                if (!this.isRecording) return;

                const { buffer } = event.data;
                this.processAudioBuffer(buffer);
            };

            source.connect(this.workletNode);
            console.log("GuitarPredictionEngine initialized");
        } catch (err) {
            console.error("Error accessing microphone:", err);
        }
    }

    processAudioBuffer(buffer: Float32Array) {
        if (!this.detectPitch) return;

        const pitchHz = this.detectPitch(buffer);
        if (pitchHz) {
            const midiNote = this.hertzToMidi(pitchHz);
            // Basic range filter (Low E roughly 40, High E roughly 88 on 24th fret?)
            if (midiNote < 40 || midiNote > 90) return;

            try {
                const mfccs = Meyda.extract('mfcc', buffer);
                if (mfccs) {
                    this.makePrediction(mfccs, midiNote);
                }
            } catch (e) {
                // Ignore frame errors
            }
        }
    }

    makePrediction(mfcc: number[] | Float32Array, note: number) {
        const noteName = this.getNoteNameFromMidi(note);
        console.log({ mfcc, note, noteName });
        tf.tidy(() => {
            const dataset = {
                mfcc: Array.from(mfcc),
                midiNote: note,
                stringNum: -1,
                noteName,
                features: Array.from([...mfcc, note]),
                normalizedFeatures: []
            }
            const normalizedDataset = normalizeDataset([dataset], statsData);
            const inputTensor = tf.tensor2d(normalizedDataset[0].normalizedFeatures);
            const prediction = this.model?.predict(inputTensor) as tf.Tensor;
            const predictedClass = prediction?.argMax(1).dataSync()[0];
            console.log({ predictedClass });
        })
        /* this.dataset.push({
            mfcc: Array.from(mfcc),
            midiNote: note,
            stringNum: this.currentLabel,
            noteName,
            features: Array.from([...mfcc, note]),
            normalizedFeatures: []
        });

        if (this.onDataCaptured) {
            this.onDataCaptured(note, this.dataset.length);
        } */
    }

    hertzToMidi(hz: number): number {
        return Math.round(69 + 12 * Math.log2(hz / 440));
    }

    getNoteNameFromMidi(midi: number): string {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const note = noteNames[midi % 12];
        const octave = Math.floor(midi / 12) - 1;
        return `${note}${octave}`;
    }

    startRecording() {
        if (!this.audioContext) this.init();
        if (this.audioContext?.state === 'suspended') this.audioContext.resume();

        this.isRecording = true;

        console.log("Recording started");
    }

    stopRecording() {
        this.isRecording = false;
        console.log("Recording stopped");
    }
}

export const audioRecordingEngine = new GuitarAudioRecordingEngine();