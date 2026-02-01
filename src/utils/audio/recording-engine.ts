import { calculateStatistics, normalizeDataset } from '@/utils/audio/dataset-preparation';
import processorUrl from '@/utils/audio/recorder-processor.ts?url';
import type { AudioAnalysisBackend, AnalysisResult } from '@/utils/audio/audio-backend-types';

const STRING_MIDI_RANGES: Record<number, { min: number, max: number }> = {
    0: { min: 64, max: 82 }, // High E: E4 (64) - A#5 (82)
    1: { min: 59, max: 77 }, // B: B3 (59) - F5 (77)
    2: { min: 55, max: 73 }, // G: G3 (55) - C#5 (73)
    3: { min: 50, max: 68 }, // D: D3 (50) - G#4 (68)
    4: { min: 45, max: 63 }, // A: A2 (45) - D#4 (63)
    5: { min: 40, max: 58 }  // Low E: E2 (40) - A#3 (58)
};

// Standard feature set definition
export const FEATURE_CONFIG = {
    MFCC_COUNT: 13,
    EXTRA_FEATURES: 4, // Centroid, Flux, Rolloff, Inharmonicity
    TOTAL_FEATURES: 18 // 13 MFCC + 1 Note + 4 Spectral
};

export interface DatasetEntry {
    mfcc: number[];
    midiNote: number;
    stringNum: number;
    noteName: string;
    features: number[];
    normalizedFeatures: number[];
}

class FeatureAdapter {
    static adapt(mfcc: number[], note: number, extra: Partial<AnalysisResult>): number[] | null {
        // 1. Validate MFCC length
        if (!mfcc || mfcc.length !== FEATURE_CONFIG.MFCC_COUNT) {
            console.warn(`Invalid MFCC length: ${mfcc?.length}. Expected ${FEATURE_CONFIG.MFCC_COUNT}`);
            return null;
        }

        // 2. Validate Extra Features availability
        // We require ALL extended features to be present for a valid strict dataset entry
        if (
            extra.spectralCentroid === undefined ||
            extra.spectralFlux === undefined ||
            extra.spectralRolloff === undefined ||
            extra.inharmonicity === undefined
        ) {
            console.warn("Missing required spectral features for adapter.");
            return null;
        }

        // 3. Construct fixed-length vector
        return [
            ...mfcc,
            note,
            extra.spectralCentroid,
            extra.spectralFlux,
            extra.spectralRolloff,
            extra.inharmonicity
        ];
    }
}

class GuitarAudioRecordingEngine {
    audioContext: AudioContext | null;
    workletNode: AudioWorkletNode | null;
    backend: AudioAnalysisBackend | null;
    dataset: DatasetEntry[];
    isRecording: boolean;
    currentLabel: number;
    onDataCaptured: ((note: number, count: number) => void) | null;

    constructor() {
        this.audioContext = null;
        this.workletNode = null;
        this.backend = null;
        this.dataset = [];
        this.isRecording = false;
        this.currentLabel = 0; // Current String Index
        this.onDataCaptured = null;
    }

    async setBackendType(type: 'meyda' | 'essentia') {
        if (type === 'essentia') {
            const { EssentiaBackend } = await import('@/utils/audio/essentia-backend');
            this.backend = new EssentiaBackend();
        } else {
            const { MeydaPitchfinderBackend } = await import('@/utils/audio/meyda-backend');
            this.backend = new MeydaPitchfinderBackend();
        }
        console.log(`Switched audio backend to: ${this.backend.name}`);

        // Re-initialize if context exists
        if (this.audioContext && this.backend) {
            await this.backend.init(this.audioContext);
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
        // Initialize default backend if not set
        if (!this.backend) {
            await this.setBackendType('meyda');
        } else {
            // If backend was already set (e.g. via setBackendType calls before init), init it now
            await this.backend.init(this.audioContext);
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

            this.workletNode.port.onmessage = (event) => {
                if (!this.isRecording) return;
                const { buffer } = event.data;
                this.processAudioBuffer(buffer);
            };

            source.connect(this.workletNode);
            console.log("GuitarAudioEngine initialized");
        } catch (err) {
            console.error("Error accessing microphone:", err);
        }
    }

    async processAudioBuffer(buffer: Float32Array) {
        if (!this.backend) return;
        // Use the backend to analyze audio
        let result: AnalysisResult = { pitch: null, mfcc: null };
        try {
            result = await this.backend.process(buffer);
        } catch (e) {
            // console.error("Error processing audio buffer", e);
        }

        if (result.pitch) {
            const midiNote = this.hertzToMidi(result.pitch);

            // String-specific Range Filter
            const range = STRING_MIDI_RANGES[this.currentLabel];

            if (range) {
                if (midiNote < range.min || midiNote > range.max) {
                    return;
                }
            } else {
                if (midiNote < 40 || midiNote > 90) return;
            }

            if (result.mfcc) {
                this.saveData(result.mfcc, midiNote, result);
            }
        }
    }

    saveData(mfcc: number[], note: number, extraFeatures: Partial<AnalysisResult> = {}) {
        // Attempt to adapt features to standard format
        const features = FeatureAdapter.adapt(mfcc, note, extraFeatures);

        if (!features) {
            // console.debug("Skipping data save: Incompatible feature set");
            return;
        }

        const noteName = this.getNoteNameFromMidi(note);

        // Log verified data
        console.log({
            note,
            noteName,
            backend: this.backend?.name,
            featuresLength: features.length
        });

        this.dataset.push({
            mfcc: Array.from(mfcc),
            midiNote: note,
            stringNum: this.currentLabel,
            noteName,
            features: features,
            normalizedFeatures: []
        });

        if (this.onDataCaptured) {
            this.onDataCaptured(note, this.dataset.length);
        }
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

    startRecording(stringIndex: number) {
        if (!this.audioContext) this.init();
        if (this.audioContext?.state === 'suspended') this.audioContext.resume();

        this.currentLabel = stringIndex;
        this.isRecording = true;

        console.log("Recording started for string", stringIndex);
    }

    stopRecording() {
        this.isRecording = false;
        console.log("Recording stopped");
    }

    downloadDataset() {
        const stats = calculateStatistics(this.dataset);
        const normalizedDataset = normalizeDataset(this.dataset, stats);
        this.saveJSONToFile(stats, `guitar_dataset_stats_${Date.now()}.json`);
        this.saveJSONToFile(normalizedDataset, `guitar_dataset_${Date.now()}.json`);
    }

    saveJSONToFile(data: any, filename: string) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

export const audioRecordingEngine = new GuitarAudioRecordingEngine();