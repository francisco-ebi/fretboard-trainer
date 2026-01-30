import Meyda from 'meyda';
import { YIN } from 'pitchfinder';
import * as tf from '@tensorflow/tfjs';
import { Subject, Observable } from 'rxjs';
import { bufferCount, filter, map } from 'rxjs/operators';
import statsData from '@/utils/audio/stats.json';
import { normalizeDataset } from '@/utils/audio/dataset-preparation';
import processorUrl from '@/utils/audio/recorder-processor.ts?url';


const baseNotes: Record<number, number> = {
    0: 64,
    1: 59,
    2: 55,
    3: 50,
    4: 45,
    5: 40
};

export interface PredictionResult {
    predictedStringNumber: number;
    predictedFret: number;
    midiNoteDetected: number;
}

class GuitarAudioRecordingEngine {
    audioContext: AudioContext | null;
    workletNode: AudioWorkletNode | null;
    detectPitch: ((buffer: Float32Array) => number | null) | null;
    isRecording: boolean;
    onNotePredicted: ((note: number, count: number) => void) | null;
    model: tf.LayersModel | null;

    // RxJS Logic
    private rawPrediction$: Subject<PredictionResult>;
    public fretPredicted$: Observable<PredictionResult>;

    constructor() {
        this.audioContext = null;
        this.workletNode = null;
        this.detectPitch = null;
        this.isRecording = false;
        this.onNotePredicted = null;
        this.model = null;

        this.rawPrediction$ = new Subject<PredictionResult>();

        // Window size 5, step 1 (rolling/sliding window)
        // Majority 75% of 5 = 3.75 -> 4
        this.fretPredicted$ = this.rawPrediction$.pipe(
            bufferCount(5, 1),
            map((window: PredictionResult[]) => {
                const countMap = new Map<string, { count: number, value: PredictionResult }>();

                for (const prediction of window) {
                    const key = `${prediction.predictedStringNumber}-${prediction.predictedFret}`;
                    const current = countMap.get(key) || { count: 0, value: prediction };
                    current.count++;
                    countMap.set(key, current);
                }

                for (const { count, value } of countMap.values()) {
                    if (count >= 4) { // 75% of 5 is 3.75, so we need 4
                        return value;
                    }
                }
                return null;
            }),
            filter((result): result is PredictionResult => result !== null)
        );

        this.fretPredicted$.subscribe(p => console.log('Emitted Prediction:', p));
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

        try {
            this.model = await tf.loadLayersModel('/model/guitar-model.json');
        } catch (e) {
            console.error("Error loading model", e);
        }

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

    private processAudioBuffer(buffer: Float32Array) {
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

    private makePrediction(mfcc: number[] | Float32Array, note: number) {
        const noteName = this.getNoteNameFromMidi(note);

        const dataset = {
            mfcc: Array.from(mfcc),
            midiNote: note,
            stringNum: -1,
            noteName,
            features: Array.from([...mfcc, note]),
            normalizedFeatures: []
        }
        const normalizedDataset = normalizeDataset([dataset], statsData);

        if (!this.model) {
            console.warn("Model not loaded yet");
            return;
        }

        const predictedClass = tf.tidy(() => {
            const inputTensor = tf.tensor2d([normalizedDataset[0].normalizedFeatures]);
            const prediction = this.model!.predict(inputTensor) as tf.Tensor;
            return prediction.argMax(1).dataSync()[0];
        });

        const predicted = this.calculateLocation(note, predictedClass);

        if (predicted) {
            // console.log('Raw:', predicted); // Optional: verbose logging
            this.rawPrediction$.next(predicted);
        }
    }

    private hertzToMidi(hz: number): number {
        return Math.round(69 + 12 * Math.log2(hz / 440));
    }

    private getNoteNameFromMidi(midi: number): string {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const note = noteNames[midi % 12];
        const octave = Math.floor(midi / 12) - 1;
        return `${note}${octave}`;
    }

    private calculateLocation(midiNoteDetected: number, predictedStringNumber: number): PredictionResult | null {
        const noteBase = baseNotes[predictedStringNumber];
        const fret = midiNoteDetected - noteBase;

        if (fret < 0) {
            // console.warn("Error: Note lower than open string");
            return null;
        }

        if (fret > 24) {
            // console.warn("Error: Fret out of range");
            return null;
        }

        return {
            predictedStringNumber,
            predictedFret: fret,
            midiNoteDetected
        };
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

export const guitarPredictionEngine = new GuitarAudioRecordingEngine();