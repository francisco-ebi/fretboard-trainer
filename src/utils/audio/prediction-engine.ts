import * as tf from '@tensorflow/tfjs';
import { Subject, Observable, merge, of, timer } from 'rxjs';
import { bufferCount, filter, map, switchMap } from 'rxjs/operators';
import statsData from '@/utils/audio/stats.json';
import { normalizeDataset } from '@/utils/audio/dataset-preparation';
import processorUrl from '@/utils/audio/recorder-processor.ts?url';
import type { AudioAnalysisBackend } from '@/utils/audio/audio-backend-types';


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
    isRecording: boolean;
    onNotePredicted: ((note: number, count: number) => void) | null;
    model: tf.LayersModel | null;
    currentMode: PredictionMode;

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
            if (this.currentMode === 'performance') {
                const { MeydaPitchfinderBackend } = await import('@/utils/audio/meyda-backend');
                this.backend = new MeydaPitchfinderBackend();
                this.model = await tf.loadLayersModel('/model/guitar-model-performance.json');
            } else {
                const { EssentiaBackend } = await import('@/utils/audio/essentia-backend');
                this.backend = new EssentiaBackend();
                try {
                    this.model = await tf.loadLayersModel('/model/guitar-model-precision.json');
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

    private async processAudioBuffer(buffer: Float32Array) {
        if (!this.backend) return;
        const result = await this.backend.process(buffer);

        if (result.pitch) {
            const midiNote = this.hertzToMidi(result.pitch);
            // Basic range filter (Low E roughly 40, High E roughly 88 on 24th fret?)
            if (midiNote < 40 || midiNote > 90) return;

            if (result.mfcc) {
                this.makePrediction(result.mfcc, midiNote);
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
        // @ts-ignore
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

export const guitarPredictionEngine = new GuitarAudioPredictionEngine();