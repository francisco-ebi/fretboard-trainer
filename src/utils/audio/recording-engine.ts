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

// Adapters removed as logic is now handled in saveData with standardized Worklet output

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
        if (this.workletNode) {
            this.workletNode.port.postMessage({ command: 'setBackend', type });
            console.log(`Switched audio backend to: ${type}`);
        } else {
            // If worklet not ready, store preference or init default?
            // For now just log
            console.warn("Worklet not initialized, cannot switch backend yet.");
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
                const result = event.data as AnalysisResult;
                this.handleAnalysisResult(result);
            };

            source.connect(this.workletNode);
            console.log("GuitarAudioEngine initialized");

            // Set default backend
            this.setBackendType('meyda');
        } catch (err) {
            console.error("Error accessing microphone:", err);
        }
    }

    handleAnalysisResult(result: AnalysisResult) {
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
        if (!mfcc || mfcc.length !== FEATURE_CONFIG.MFCC_COUNT) {
            // console.warn(`Invalid MFCC length: ${mfcc?.length}. Expected ${FEATURE_CONFIG.MFCC_COUNT}`);
            return;
        }

        const features = [
            ...mfcc,
            note,
            extraFeatures.spectralCentroid || 0,
            extraFeatures.spectralRolloff || 0
        ];

        // If we want to support the strict Essentia 18 features (MFCC+Note+Centroid+Flux+Rolloff+Inharm)
        if (extraFeatures.inharmonicity !== undefined && extraFeatures.inharmonicity !== null) {
            const extendedFeatures = [
                ...mfcc,
                note,
                extraFeatures.spectralCentroid || 0,
                extraFeatures.spectralFlux || 0,
                extraFeatures.spectralRolloff || 0,
                extraFeatures.inharmonicity || 0
            ];

            if (extendedFeatures.some(f => f === null || f === undefined || isNaN(f))) return; // Strict check

            this.dataset.push({
                mfcc: Array.from(mfcc),
                midiNote: note,
                stringNum: this.currentLabel,
                noteName: this.getNoteNameFromMidi(note),
                features: extendedFeatures,
                normalizedFeatures: []
            });

        } else {
            // Meyda style (MFCC + Note + Centroid + Rolloff)
            this.dataset.push({
                mfcc: Array.from(mfcc),
                midiNote: note,
                stringNum: this.currentLabel,
                noteName: this.getNoteNameFromMidi(note),
                features: features, // MFCC, Note, Centroid, Rolloff
                normalizedFeatures: []
            });
        }

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