// import * as tf from '@tensorflow/tfjs'; // Removed static import
import type { LayersModel, Tensor } from '@tensorflow/tfjs'; // Type-only import
import { Subject, Observable, merge, of, timer } from 'rxjs';
import { bufferCount, filter, map, switchMap } from 'rxjs/operators';
import { normalizeDataset } from '@/utils/audio/dataset-preparation';
import processorUrl from '@/utils/audio/recorder-processor.ts?url';
import type { AnalysisResult } from '@/utils/audio/audio-backend-types';


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
    statsData: any = null;
    isRecording: boolean;
    onNotePredicted: ((note: number, count: number) => void) | null;
    model: LayersModel | null;
    currentMode: PredictionMode;
    private tf: any = null; // Store TFJS instance

    // Buffering
    private frameBuffer: AnalysisResult[] = [];
    private readonly SEQUENCE_LENGTH = 5;

    // RxJS Logic
    private rawPrediction$: Subject<PredictionResult>;
    public fretPredicted$: Observable<PredictionResult | null>;

    constructor() {
        this.audioContext = null;
        this.workletNode = null;
        this.isRecording = false;
        this.onNotePredicted = null;
        this.model = null;
        this.currentMode = 'performance'; // Default

        this.rawPrediction$ = new Subject<PredictionResult>();

        const step = 1;
        const windowSize = 3;
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
        if (this.currentMode === mode && this.model) return;
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

            // Load Model & Stats
            if (this.currentMode === 'performance') {
                this.model = await this.tf.loadLayersModel('/model/guitar-meyda-ts-model.json');
                this.statsData = await import('@/utils/audio/datasets/meyda-timeseries/guitar_dataset_stats.json');
            } else {
                try {
                    this.model = await this.tf.loadLayersModel('/model/guitar-essentia-model.json');
                    this.statsData = await import('@/utils/audio/datasets/essentia_initial/guitar_dataset_stats.json');
                } catch (e) {
                    console.warn("Precision model not found. Predictions might be unavailable.");
                    this.model = null;
                }
            }

            // Switch Worklet Backend
            if (this.workletNode) {
                const backendType = this.currentMode === 'performance' ? 'meyda' : 'essentia';
                this.workletNode.port.postMessage({ command: 'setBackend', type: backendType });
                console.log(`[PredictionEngine] Switched worklet backend to ${backendType}`);
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

        // Load resources (model) if not loaded
        if (!this.model) {
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

            // Set initial backend
            const backendType = this.currentMode === 'performance' ? 'meyda' : 'essentia';
            this.workletNode.port.postMessage({ command: 'setBackend', type: backendType });

            this.workletNode.port.onmessage = (event) => {
                if (!this.isRecording) return;
                const result = event.data as AnalysisResult;
                this.handleAnalysisResult(result);
            };

            source.connect(this.workletNode);
            console.log("GuitarPredictionEngine initialized");
        } catch (err) {
            console.error("Error accessing microphone:", err);
        }
    }

    private handleAnalysisResult(result: AnalysisResult) {
        if (result.pitch) {
            const midiNote = this.hertzToMidi(result.pitch);
            // Basic range filter
            if (midiNote < 40 || midiNote > 90) return;
            if (result.mfcc) {
                // Buffer frames
                this.frameBuffer.push(result);

                if (this.frameBuffer.length > this.SEQUENCE_LENGTH) {
                    this.frameBuffer.shift();
                }
                if (this.frameBuffer.length === this.SEQUENCE_LENGTH) {
                    this.makeSequencePrediction(this.frameBuffer);
                }
            }
        }
    }


    private makeSequencePrediction(buffer: AnalysisResult[]) {
        if (!this.model || !this.tf || !this.statsData) {
            // console.warn("Model, TFJS or Stats not loaded yet");
            return;
        }
        // Let's use the last valid pitch.
        const lastFrame = buffer[buffer.length - 1];
        if (!lastFrame.pitch) return;
        const paramsMidiNote = this.hertzToMidi(lastFrame.pitch);
        const noteName = this.getNoteNameFromMidi(paramsMidiNote);

        // Construct Sequence Features
        const sequenceFeatures: number[][] = buffer.map(frame => {
            const midiNote = frame.pitch ? this.hertzToMidi(frame.pitch) : 0;
            const mfcc = frame.mfcc || new Array(13).fill(0);

            const featuresList = [...mfcc, midiNote];

            if (this.currentMode === 'performance') {
                // Expecting 16
                const spectralCentroid = frame.spectralCentroid || 0;
                featuresList.push(spectralCentroid);
                featuresList.push(frame.spectralRolloff || 0);
                featuresList.push((spectralCentroid / midiNote || 1) || 0);
            } else {
                // Expecting 18
                featuresList.push(frame.spectralCentroid || 0);
                featuresList.push(frame.spectralFlux || 0);
                featuresList.push(frame.spectralRolloff || 0);
                featuresList.push(frame.inharmonicity || 0);
            }
            return featuresList;
        });

        // Construct a mock DatasetEntry for normalization
        const datasetEntry = {
            mfcc: [],
            midiNote: paramsMidiNote,
            stringNum: -1,
            noteName,
            features: sequenceFeatures,
            normalizedFeatures: []
        };

        // Normalize
        const normalizedDataset = normalizeDataset([datasetEntry], this.statsData);


        // Tensor Input: [1, 5, 16] or [1, 5, 18]
        const inputSequence = normalizedDataset[0].normalizedFeatures; // number[][]

        const predictedClass = this.tf.tidy(() => {
            // Create 3D tensor: [batch_size, time_steps, features] -> [1, 5, F]
            const inputTensor = this.tf.tensor([inputSequence]);
            const prediction = this.model!.predict(inputTensor) as Tensor;
            return prediction.argMax(1).dataSync()[0];
        });

        const predicted = this.calculateLocation(paramsMidiNote, predictedClass);

        if (predicted) {
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
        this.frameBuffer = []; // Reset buffer

        console.log("Recording started");
    }

    stopRecording() {
        this.isRecording = false;
        console.log("Recording stopped");
    }


}

export const guitarPredictionEngine = new GuitarAudioPredictionEngine();