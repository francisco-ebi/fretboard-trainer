import { calculateStatistics, normalizeDataset } from '@/utils/audio/dataset-preparation';
import essentiaProcessorUrl from '@/utils/audio/essentia-recorder-processor.ts?url';
import meydaProcessorUrl from '@/utils/audio/meyda-recorder-processor.ts?url';
import { type AnalysisResult } from '@/utils/audio/audio-backend-types';
import { AudioReader, RingBuffer } from '@/utils/audio/sab-ring-buffer';
import { FEATURE_POSITIONS } from '@/utils/audio/worklet-types';

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
    EXTRA_FEATURES: 7,
    TOTAL_FEATURES: 21
};

export interface DatasetEntry {
    midiNote: number;
    stringNum: number;
    noteName: string;
    features: number[][];
    normalizedFeatures: number[][];
}

class GuitarAudioRecordingEngine {
    audioContext: AudioContext | null;
    gainNode: GainNode | null;
    workletNode: AudioWorkletNode | null;
    sourceNode: MediaStreamAudioSourceNode | null;
    backend: any | null; // Placeholder as actual backend is in worklet
    activeBackendType: 'meyda' | 'essentia';
    dataset: DatasetEntry[];
    isRecording: boolean;
    currentLabel: number;
    onDataCaptured: ((note: number, count: number) => void) | null;
    private frameBuffer: { features: number[] }[] = [];
    private sharedBuffer: SharedArrayBuffer | null = null;
    private audioReader: AudioReader | null = null;
    private pollingInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        this.audioContext = null;
        this.gainNode = null;
        this.workletNode = null;
        this.sourceNode = null;
        this.activeBackendType = 'essentia';
        this.backend = null;
        this.dataset = [];
        this.isRecording = false;
        this.currentLabel = 0; // Current String Index
        this.onDataCaptured = null;
        this.frameBuffer = [];
    }

    async setBackendType(type: 'meyda' | 'essentia') {
        this.activeBackendType = type;
        if (this.audioContext && this.sourceNode) {
            if (this.workletNode) {
                this.workletNode.disconnect();
            }

            // Re-initialize SAB for new processor
            this.sharedBuffer = new SharedArrayBuffer(1024 * Float32Array.BYTES_PER_ELEMENT);
            const ringBuffer = new RingBuffer(this.sharedBuffer);
            this.audioReader = new AudioReader(ringBuffer);

            this.workletNode = new AudioWorkletNode(
                this.audioContext,
                `${type}-recorder-processor`,
                { numberOfInputs: 1, processorOptions: { sampleRate: this.audioContext.sampleRate, bufferSize: 2048 } }
            );

            // Send SAB to the newly created worklet
            this.workletNode.port.postMessage({ command: 'sab', sab: this.sharedBuffer });

            this.sourceNode.connect(this.workletNode);
            if (this.gainNode) {
                this.workletNode.connect(this.gainNode);
                this.gainNode.connect(this.audioContext.destination);
            }

            if (this.isRecording) {
                this.workletNode.port.postMessage({ command: 'setString', stringIndex: this.currentLabel });
                this.startPolling();
            } else {
                this.stopPolling();
            }

            console.log(`Switched audio backend to: ${type}`);
        } else {
            console.warn("Audio Context or Source Node not initialized yet, backend preference saved.");
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

    async init() {
        if (this.audioContext) return;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioContextClass();

        if (!this.audioContext) {
            console.error("AudioContext not supported");
            return;
        }

        try {
            await this.audioContext.audioWorklet.addModule(essentiaProcessorUrl);
            await this.audioContext.audioWorklet.addModule(meydaProcessorUrl);
        } catch (e) {
            console.error("Error loading Worklet. Verify browser support.", e);
            return;
        }

        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const inputs = devices.filter(device => device.kind === 'audioinput');
            const selectedDeviceId = inputs.find(i => i.label.includes('USB Audio CODEC'))?.deviceId;

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false,
                    channelCount: 1,
                    deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined
                }
            });
            this.sourceNode = this.audioContext.createMediaStreamSource(stream);
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 0;

            console.log("GuitarAudioEngine initialized");

            // Set default backend
            await this.setBackendType(this.activeBackendType);
        } catch (err) {
            console.error("Error accessing microphone:", err);
        }
    }

    handleSerializedResult(features: Float32Array) {
        const pitch = features[FEATURE_POSITIONS.PITCH];

        if (pitch && pitch !== -1 && pitch > 0) {
            const midiNote = this.hertzToMidi(pitch);
            // String-specific Range Filter
            const range = STRING_MIDI_RANGES[this.currentLabel];

            if (range) {
                if (midiNote < range.min || midiNote > range.max) {
                    return;
                }
            } else {
                if (midiNote < 40 || midiNote > 90) return;
            }

            // Extract MFCCs
            const mfcc = Array.from(features.subarray(FEATURE_POSITIONS.MFCC_START, FEATURE_POSITIONS.MFCC_START + 13));

            const extraFeatures: Partial<AnalysisResult> = {
                spectralCentroid: features[FEATURE_POSITIONS.CENTROID],
                spectralRolloff: features[FEATURE_POSITIONS.ROLLOFF],
                spectralFlux: features[FEATURE_POSITIONS.FLUX],
                inharmonicity: features[FEATURE_POSITIONS.INHARMONICITY],
                rms: features[FEATURE_POSITIONS.RMS]
            };

            if (mfcc) {
                this.saveData(mfcc, midiNote, extraFeatures);
            }
        }
    }

    saveData(mfcc: number[], note: number, extraFeatures: Partial<AnalysisResult> = {}) {
        if (!mfcc || mfcc.length !== FEATURE_CONFIG.MFCC_COUNT) {
            return;
        }

        let currentFrameFeatures: number[] = [];

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
            currentFrameFeatures = extendedFeatures;

        } else {
            // Meyda style (MFCC + Note + Centroid + Rolloff + brightnessPerNote)
            const brightnessPerNote = (note / (extraFeatures?.spectralCentroid || 1)) || 0;
            currentFrameFeatures = [
                ...mfcc,
                note,
                extraFeatures.spectralCentroid || 0,
                extraFeatures.spectralRolloff || 0,
                brightnessPerNote
            ];
        }

        // Buffer the frame
        this.frameBuffer.push({
            features: currentFrameFeatures
        });

        // Check if buffer is full
        if (this.frameBuffer.length >= 5) {
            // Create sequence entry
            const sequenceEntry: DatasetEntry = {
                midiNote: note,
                stringNum: this.currentLabel,
                noteName: this.getNoteNameFromMidi(note),
                features: this.frameBuffer.map(f => f.features),
                normalizedFeatures: []
            };

            this.dataset.push(sequenceEntry);
            if (this.onDataCaptured) {
                this.onDataCaptured(note, this.dataset.length);
                console.log(`Captured sequence for ${this.getNoteNameFromMidi(note)}. Total sequences: ${this.dataset.length}`);
            }

            // Clear buffer to start next sequence
            this.frameBuffer = [];
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
        this.frameBuffer = []; // Reset buffer

        console.log("Recording started for string", stringIndex);

        if (this.workletNode) {
            this.workletNode.port.postMessage({ command: 'setString', stringIndex });
        }

        this.startPolling();
    }

    stopRecording() {
        this.isRecording = false;
        this.stopPolling();
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