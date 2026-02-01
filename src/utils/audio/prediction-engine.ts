// import * as tf from '@tensorflow/tfjs'; // Removed static import
import type { LayersModel, Tensor } from '@tensorflow/tfjs'; // Type-only import
import { Subject, Observable, merge, of, timer } from 'rxjs';
import { bufferCount, filter, map, switchMap } from 'rxjs/operators';
import { normalizeDataset } from '@/utils/audio/dataset-preparation';
import processorUrl from '@/utils/audio/recorder-processor.ts?url';
import type { AudioAnalysisBackend, AnalysisResult } from '@/utils/audio/audio-backend-types';


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

export type PredictionMode = 'performance' | 'precision';

class GuitarAudioPredictionEngine {
    audioContext: AudioContext | null;
    workletNode: AudioWorkletNode | null;
    backend: AudioAnalysisBackend | null;
    statsData: any = null;
    isRecording: boolean;
    onNotePredicted: ((note: number, count: number) => void) | null;
    model: LayersModel | null;
    currentMode: PredictionMode;
    private tf: any = null; // Store TFJS instance

    // RxJS Logic
    private rawPrediction$: Subject<PredictionResult>;
    public fretPredicted$: Observable<PredictionResult | null>;

    constructor() {
        this.audioContext = null;
        this.workletNode = null;
        this.backend = null;
        this.isRecording = false;
        this.onNotePredicted = null;
        this.model = null;
        this.currentMode = 'performance'; // Default

        this.rawPrediction$ = new Subject<PredictionResult>();

        const step = 1;
        const windowSize = 10;
        const majorityThreshold = windowSize * 0.7;
        // Window size 10, step 1 (rolling/sliding window)
        // Majority 70% of 10 = 7

        const stableStream$ = this.rawPrediction$.pipe(
            bufferCount(windowSize, step),
            map((window: PredictionResult[]) => {
                const countMap = new Map<string, { count: number, value: PredictionResult }>();

                for (const prediction of window) {
                    const key = `${prediction.predictedStringNumber}-${prediction.predictedFret}`;
                    const current = countMap.get(key) || { count: 0, value: prediction };
                    current.count++;
                    countMap.set(key, current);
                }

                for (const { count, value } of countMap.values()) {
                    if (count >= majorityThreshold) {
                        return value;
                    }
                }
                return null;
            }),
            filter((result): result is PredictionResult => result !== null)
        );

        // SwitchMap to a merged observable of (value + null-timer)
        // If a new value arrives, the previous timer is cancelled/switched away from.
        this.fretPredicted$ = stableStream$.pipe(
            switchMap(val => merge(
                of(val),
                timer(5000).pipe(map(() => null))
            ))
        );

        this.fretPredicted$.subscribe(p => console.log('Emitted Prediction:', p));
    }

    async setMode(mode: PredictionMode) {
        if (this.currentMode === mode && this.backend) return;
        this.currentMode = mode;

        // Reset and reload based on mode
        await this.loadResourcesForMode();
    }

    async loadResourcesForMode() {
        console.log(`Loading resources for mode: ${this.currentMode}`);
        try {
            // Lazy load TensorFlow.js
            if (!this.tf) {
                this.tf = await import('@tensorflow/tfjs');
            }

            if (this.currentMode === 'performance') {
                const { MeydaPitchfinderBackend } = await import('@/utils/audio/meyda-backend');
                this.backend = new MeydaPitchfinderBackend();
                this.model = await this.tf.loadLayersModel('/model/guitar-model-performance.json');
                this.statsData = await import('@/utils/audio/datasets/meyda-initial/guitar_dataset_stats.json');
            } else {
                const { EssentiaBackend } = await import('@/utils/audio/essentia-backend');
                this.backend = new EssentiaBackend();
                try {
                    this.model = await this.tf.loadLayersModel('/model/guitar-model-precision.json');
                } catch (e) {
                    console.warn("Precision model not found. Predictions might be unavailable.");
                    this.model = null;
                }
            }

            if (this.audioContext) {
                await this.backend.init(this.audioContext);
            }
        } catch (e) {
            console.error("Error loading resources", e);
        }
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

        // Load resources (backend + model) if not loaded
        if (!this.backend) {
            await this.loadResourcesForMode();

        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false,
                }
            });
            const source = this.audioContext.createMediaStreamSource(stream);
            this.workletNode = new AudioWorkletNode(this.audioContext, 'recorder-processor');
            await this.backend!.init(this.audioContext);

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

    private async processAudioBuffer(buffer: Float32Array) {
        if (!this.backend) return;
        const result = await this.backend.process(buffer);

        if (result.pitch) {
            const midiNote = this.hertzToMidi(result.pitch);
            // Basic range filter (Low E roughly 40, High E roughly 88 on 24th fret?)
            if (midiNote < 40 || midiNote > 90) return;

            if (result.mfcc) {
                this.makePrediction(result.mfcc, midiNote, result);
            }
        }
    }

    private makePrediction(mfcc: number[] | Float32Array, note: number, extraFeatures?: Partial<AnalysisResult>) {
        const noteName = this.getNoteNameFromMidi(note);

        const featuresList = [...mfcc, note];

        // Dynamically add extra features if stats model supports them
        // Order must match training: Centroid, Flux, Rolloff, Inharmonicity
        // We check if statsData has more columns than standard (14)
        if (this.backend?.name === 'meyda-pitchfinder' && extraFeatures) {
            featuresList.push(typeof extraFeatures.spectralCentroid === 'number' ? extraFeatures.spectralCentroid : 0);
            featuresList.push(typeof extraFeatures.spectralRolloff === 'number' ? extraFeatures.spectralRolloff : 0);
        }
        if (this.backend?.name === 'essentia-backend' && extraFeatures) {
            featuresList.push(typeof extraFeatures.spectralCentroid === 'number' ? extraFeatures.spectralCentroid : 0);
            featuresList.push(typeof extraFeatures.spectralFlux === 'number' ? extraFeatures.spectralFlux : 0);
            featuresList.push(typeof extraFeatures.spectralRolloff === 'number' ? extraFeatures.spectralRolloff : 0);
            featuresList.push(typeof extraFeatures.inharmonicity === 'number' ? extraFeatures.inharmonicity : 0);
        }

        const dataset = {
            mfcc: Array.from(mfcc),
            midiNote: note,
            stringNum: -1,
            noteName,
            features: Array.from(featuresList),
            normalizedFeatures: []
        }
        // @ts-ignore
        const normalizedDataset = normalizeDataset([dataset], this.statsData);

        if (!this.model || !this.tf) {
            console.warn("Model or TFJS not loaded yet");
            return;
        }

        const predictedClass = this.tf.tidy(() => {
            const inputTensor = this.tf.tensor2d([normalizedDataset[0].normalizedFeatures]);
            const prediction = this.model!.predict(inputTensor) as Tensor;
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

export const guitarPredictionEngine = new GuitarAudioPredictionEngine();