// import * as tf from '@tensorflow/tfjs'; // Removed static import
import type { LayersModel, Tensor } from '@tensorflow/tfjs'; // Type-only import
import { Subject, Observable, merge, of, timer } from 'rxjs';
import { bufferCount, filter, map, switchMap } from 'rxjs/operators';
import { normalizeDataset, NUM_FEATURES, SEQUENCE_LENGTH } from '@/shared/lib/audio/dataset-preparation';
import { HARMONIC_PARTIAL_COUNT } from '@/shared/lib/audio/harmonic-features';
// ?worker&url bundles the worklet entry (TS compiled, imports resolved) and
// returns its URL. Plain ?url ships raw TypeScript in production builds,
// which AudioWorklet.addModule cannot execute.
import audioCaptureProcessorUrl from '@/shared/lib/audio/audio-capture-processor.ts?worker&url';
import { AudioReader, RingBuffer, createRingBufferSab, AUDIO_RING_CAPACITY } from '@/shared/lib/audio/sab-ring-buffer';
import { FEATURE_POSITIONS, PIPELINE_VERSIONS, type AnalysisResult } from '@/shared/lib/audio/worklet-types';
import { validateManifestEntry, validateModelShape, type ModelManifest, type PipelineExpectations } from '@/shared/lib/audio/model-manifest';


// Max time between accepted frames before a sequence is considered broken
// (hop is ~23ms at 44.1kHz, so this tolerates ~6 gated/dropped frames)
const MAX_FRAME_GAP_MS = 150;

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

// The meyda/performance feature vector built in makeSequencePrediction
const MEYDA_NUM_FEATURES = 17;

// What the *running code* produces per mode; manifest entries must agree.
const PIPELINE_EXPECTATIONS: Record<PredictionMode, PipelineExpectations> = {
    performance: {
        numFeatures: MEYDA_NUM_FEATURES,
        sequenceLength: SEQUENCE_LENGTH,
        pipelineVersion: PIPELINE_VERSIONS.meyda
    },
    precision: {
        numFeatures: NUM_FEATURES,
        sequenceLength: SEQUENCE_LENGTH,
        pipelineVersion: PIPELINE_VERSIONS.essentia
    },
};

class GuitarAudioPredictionEngine {
    audioContext: AudioContext | null;
    workletNode: AudioWorkletNode | null;
    sourceNode: MediaStreamAudioSourceNode | null;
    statsData: any = null;
    isRecording: boolean;
    onNotePredicted: ((note: number, count: number) => void) | null;
    model: LayersModel | null;
    currentMode: PredictionMode;
    private tf: any = null; // Store TFJS instance

    // Buffering
    private frameBuffer: AnalysisResult[] = [];
    private lastFrameNote: number | null = null;
    private lastFrameTime: number = 0;
    private readonly SEQUENCE_LENGTH = 5;
    private sharedBuffer: SharedArrayBuffer | null = null;
    private audioReader: AudioReader | null = null;
    private featureWorker: Worker | null = null;
    private pollingInterval: ReturnType<typeof setInterval> | null = null;

    // RxJS Logic
    private rawPrediction$: Subject<PredictionResult>;
    public fretPredicted$: Observable<PredictionResult | null>;

    constructor() {
        this.audioContext = null;
        this.workletNode = null;
        this.sourceNode = null;
        this.isRecording = false;
        this.onNotePredicted = null;
        this.model = null;
        this.currentMode = 'performance'; // Default

        this.rawPrediction$ = new Subject<PredictionResult>();

        const step = 1;
        const windowSize = 5;
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

        // this.fretPredicted$.subscribe(p => console.log('Emitted Prediction:', p));
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

            // Model + normalization stats come as one validated artifact from
            // the manifest: stats embedded next to the model pointer cannot
            // get unpaired. Dimension mismatches disable the model (guaranteed
            // garbage); pipeline-version drift only warns.
            this.model = null;
            this.statsData = null;
            try {
                const response = await fetch(`${import.meta.env.BASE_URL}model/manifest.json`);
                if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
                const manifest: ModelManifest = await response.json();
                const entry = manifest.modes?.[this.currentMode];

                if (!entry) {
                    console.warn(
                        `[PredictionEngine] No manifest entry for mode '${this.currentMode}'. ` +
                        `Predictions stay disabled until a model is trained and its generated ` +
                        `entry is added to public/model/manifest.json.`
                    );
                } else {
                    const { errors, warnings } = validateManifestEntry(entry, PIPELINE_EXPECTATIONS[this.currentMode]);
                    warnings.forEach(w => console.warn(`[PredictionEngine] ${entry.model}: ${w}`));
                    if (errors.length > 0) {
                        errors.forEach(e => console.error(`[PredictionEngine] ${entry.model}: ${e}`));
                    } else {
                        const model = await this.tf.loadLayersModel(`${import.meta.env.BASE_URL}model/${entry.model}`);
                        const shapeError = validateModelShape(model.inputs[0].shape, entry);
                        if (shapeError) {
                            console.error(`[PredictionEngine] ${entry.model}: ${shapeError}`);
                            model.dispose();
                        } else {
                            this.model = model;
                            this.statsData = entry.stats;
                        }
                    }
                }
            } catch (e) {
                console.error('[PredictionEngine] Could not load model manifest:', e);
            }

            // Switch analysis backend
            if (this.audioContext && this.sourceNode) {
                const backendType = this.currentMode === 'performance' ? 'meyda' : 'essentia';
                this.setupAudioPipeline(backendType);

                if (this.isRecording) {
                    this.startPolling();
                } else {
                    this.stopPolling();
                }
                console.log(`[PredictionEngine] Switched analysis backend to ${backendType}`);
            }

        } catch (e) {
            console.error("Error loading resources", e);
        }
    }

    // Capture worklet → raw-audio SAB → feature worker → feature SAB → engine.
    // The worklet only copies samples; all DSP runs in the worker so the
    // realtime audio thread never blocks on feature extraction.
    private setupAudioPipeline(backendType: 'meyda' | 'essentia') {
        if (!this.audioContext || !this.sourceNode) return;

        if (this.workletNode) {
            this.workletNode.disconnect();
        }
        this.featureWorker?.terminate();

        const audioSab = createRingBufferSab(AUDIO_RING_CAPACITY);
        this.sharedBuffer = createRingBufferSab(1024);
        this.audioReader = new AudioReader(new RingBuffer(this.sharedBuffer));

        this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor', { numberOfInputs: 1 });
        this.workletNode.port.postMessage({ command: 'sab', sab: audioSab });

        this.featureWorker = backendType === 'essentia'
            ? new Worker(new URL('./essentia-feature-worker.ts', import.meta.url), { type: 'module' })
            : new Worker(new URL('./meyda-feature-worker.ts', import.meta.url), { type: 'module' });
        this.featureWorker.postMessage({
            command: 'init',
            audioSab,
            featureSab: this.sharedBuffer,
            sampleRate: this.audioContext.sampleRate,
            bufferSize: 2048
        });

        this.sourceNode.connect(this.workletNode);
    }

    async init(deviceId?: string | null) {
        if (this.audioContext) return;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioContextClass();

        if (!this.audioContext) {
            console.error("AudioContext not supported");
            return;
        }
        try {
            await this.audioContext.audioWorklet.addModule(audioCaptureProcessorUrl);
        } catch (e) {
            console.error("Error loading Worklet. Verify browser support.", e);
            return;
        }

        // Load resources (model) if not loaded
        if (!this.model) {
            await this.loadResourcesForMode();
        }

        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            
            let targetDeviceId = deviceId;
            if (!targetDeviceId) {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const inputs = devices.filter(device => device.kind === 'audioinput');
                targetDeviceId = inputs.find(i => i.deviceId === 'default')?.deviceId || inputs[0]?.deviceId;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false,
                    channelCount: 1,
                    deviceId: targetDeviceId ? { exact: targetDeviceId } : undefined
                }
            });
            this.sourceNode = this.audioContext.createMediaStreamSource(stream);

            // Set initial backend
            const backendType = this.currentMode === 'performance' ? 'meyda' : 'essentia';
            this.setupAudioPipeline(backendType);
            console.log("GuitarPredictionEngine initialized");
        } catch (err) {
            console.error("Error accessing microphone:", err);
        }
    }

    private startPolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);

        // Poll SAB frequently
        this.pollingInterval = setInterval(() => {
            if (!this.audioReader || !this.isRecording) return;

            const numFeatures = FEATURE_POSITIONS.TOTAL_FEATURES;
            const available = this.audioReader.available_read();

            if (available >= numFeatures) {
                const elements = new Float32Array(available);
                this.audioReader.dequeue(elements);

                // Process elements chunk by chunk (e.g. 21 at a time)
                for (let i = 0; i <= elements.length - numFeatures; i += numFeatures) {
                    const featureChunk = elements.subarray(i, i + numFeatures);
                    this.handleSerializedResult(featureChunk);
                }
            }
        }, 16);
    }

    private stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    private handleSerializedResult(features: Float32Array) {
        const pitch = features[FEATURE_POSITIONS.PITCH];

        if (pitch && pitch !== -1 && pitch > 0) {
            const midiNote = this.hertzToMidi(pitch);
            // Basic range filter
            if (midiNote < 40 || midiNote > 90) return;

            const mfcc = Array.from(features.subarray(FEATURE_POSITIONS.MFCC_START, FEATURE_POSITIONS.MFCC_START + 13));

            // Reconstruct AnalysisResult for internal buffering
            const resultObj: AnalysisResult = {
                pitch: pitch,
                mfcc: mfcc,
                spectralCentroid: features[FEATURE_POSITIONS.CENTROID],
                spectralRolloff: features[FEATURE_POSITIONS.ROLLOFF],
                spectralFlux: features[FEATURE_POSITIONS.FLUX],
                inharmonicity: features[FEATURE_POSITIONS.INHARMONICITY],
                rms: features[FEATURE_POSITIONS.RMS],
                pitchConfidence: features[FEATURE_POSITIONS.PITCH_CONFIDENCE],
                inharmonicityB: features[FEATURE_POSITIONS.INHARMONICITY_B],
                isOnset: features[FEATURE_POSITIONS.ONSET] > 0.5,
                snr: features[FEATURE_POSITIONS.SNR],
                harmonicsDb: Array.from(features.subarray(
                    FEATURE_POSITIONS.HARMONIC_DB_START,
                    FEATURE_POSITIONS.HARMONIC_DB_START + HARMONIC_PARTIAL_COUNT
                )),
                tristimulus: Array.from(features.subarray(
                    FEATURE_POSITIONS.TRISTIMULUS_START,
                    FEATURE_POSITIONS.TRISTIMULUS_START + 3
                )),
                oddEvenRatio: features[FEATURE_POSITIONS.ODD_EVEN]
            };

            if (mfcc) {
                // A sequence must be one note from one continuous pluck: discard
                // buffered frames when the note changes, the signal was
                // interrupted, or a new pluck onset arrives.
                const now = performance.now();
                if (this.lastFrameNote !== midiNote || now - this.lastFrameTime > MAX_FRAME_GAP_MS || resultObj.isOnset) {
                    this.frameBuffer = [];
                }
                this.lastFrameNote = midiNote;
                this.lastFrameTime = now;

                // Buffer frames
                this.frameBuffer.push(resultObj);

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
                // Expecting 17
                const spectralCentroid = frame.spectralCentroid || 0;
                featuresList.push(spectralCentroid);
                featuresList.push(frame.spectralRolloff || 0);
                // Must match recording-engine's brightnessPerNote = note / centroid
                featuresList.push((midiNote / (spectralCentroid || 1)) || 0);
            } else {
                // Essentia layout: must match recording-engine's saveData order
                featuresList.push(frame.spectralCentroid || 0);
                featuresList.push(frame.spectralFlux || 0);
                featuresList.push(frame.spectralRolloff || 0);
                featuresList.push(frame.inharmonicity || 0);
                featuresList.push(frame.rms || 0);
                featuresList.push(frame.inharmonicityB || 0);
                featuresList.push(frame.isOnset ? 1 : 0);
                featuresList.push(frame.snr || 0);
                const harmonicsDb = frame.harmonicsDb ?? [];
                const tristimulus = frame.tristimulus ?? [];
                for (let i = 0; i < HARMONIC_PARTIAL_COUNT; i++) {
                    featuresList.push(harmonicsDb[i] ?? 0);
                }
                featuresList.push(tristimulus[0] ?? 0);
                featuresList.push(tristimulus[1] ?? 0);
                featuresList.push(tristimulus[2] ?? 0);
                featuresList.push(frame.oddEvenRatio || 0);
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


        // Tensor Input: [1, 5, 17] (performance) or [1, 5, 33] (precision)
        const inputSequence = normalizedDataset[0].normalizedFeatures; // number[][]

        const probabilities = this.tf.tidy(() => {
            // Create 3D tensor: [batch_size, time_steps, features] -> [1, 5, F]
            const inputTensor = this.tf.tensor([inputSequence]);
            const prediction = this.model!.predict(inputTensor) as Tensor;
            return prediction.dataSync();
        });

        // Feasibility masking: for the detected pitch only strings whose
        // implied fret lies in [0, 24] are physically possible, so restrict
        // the argmax to those instead of letting the model pick an
        // impossible string that would be discarded downstream.
        let predictedClass = -1;
        let bestProbability = -Infinity;
        for (let stringNum = 0; stringNum < 6; stringNum++) {
            const fret = paramsMidiNote - baseNotes[stringNum];
            if (fret < 0 || fret > 24) continue;
            if (probabilities[stringNum] > bestProbability) {
                bestProbability = probabilities[stringNum];
                predictedClass = stringNum;
            }
        }
        if (predictedClass < 0) return; // note outside the instrument's range

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
        this.lastFrameNote = null;
        this.lastFrameTime = 0;

        if (this.workletNode) {
            this.startPolling();
        }

        console.log("Recording started");
    }

    stopRecording() {
        this.isRecording = false;
        this.stopPolling();
        console.log("Recording stopped");
    }


}

export const guitarPredictionEngine = new GuitarAudioPredictionEngine();