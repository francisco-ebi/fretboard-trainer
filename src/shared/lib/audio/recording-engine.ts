import { calculateStatistics, normalizeDataset } from '@/shared/lib/audio/dataset-preparation';
import { HARMONIC_PARTIAL_COUNT } from '@/shared/lib/audio/harmonic-features';
import { parseDatasetFile } from '@/shared/lib/audio/dataset-import';
import {
    appendAutosaved,
    maxAutosavedKey,
    countAutosavedUpTo,
    readAutosavedUpTo,
    clearAutosavedUpTo,
    clearAutosavedAbove
} from '@/shared/lib/audio/dataset-autosave';
// ?worker&url bundles the worklet entry (TS compiled, imports resolved) and
// returns its URL. Plain ?url ships raw TypeScript in production builds,
// which AudioWorklet.addModule cannot execute.
import audioCaptureProcessorUrl from '@/shared/lib/audio/audio-capture-processor.ts?worker&url';
import { AudioReader, RingBuffer, createRingBufferSab, AUDIO_RING_CAPACITY } from '@/shared/lib/audio/sab-ring-buffer';
import { FEATURE_POSITIONS, type AnalysisResult } from '@/shared/lib/audio/worklet-types';

// min is the open-string MIDI note — session-plan.ts pins its own copy to it
export const STRING_MIDI_RANGES: Record<number, { min: number, max: number }> = {
    0: { min: 64, max: 82 }, // High E: E4 (64) - A#5 (82)
    1: { min: 59, max: 77 }, // B: B3 (59) - F5 (77)
    2: { min: 55, max: 73 }, // G: G3 (55) - C#5 (73)
    3: { min: 50, max: 68 }, // D: D3 (50) - G#4 (68)
    4: { min: 45, max: 63 }, // A: A2 (45) - D#4 (63)
    5: { min: 40, max: 58 }  // Low E: E2 (40) - A#3 (58)
};

// Max time between accepted frames before a sequence is considered broken
// (hop is ~23ms at 44.1kHz, so this tolerates ~6 gated/dropped frames)
const MAX_FRAME_GAP_MS = 150;

// Standard feature set definition (essentia model input):
// 13 MFCC + note + centroid + flux + rolloff + inharmonicity + rms + log10(B)
// + onset + snr + 7 partial dB ratios + 3 tristimulus + odd/even ratio
export const FEATURE_CONFIG = {
    MFCC_COUNT: 13,
    EXTRA_FEATURES: 20,
    TOTAL_FEATURES: 33
};

export interface DatasetEntry {
    midiNote: number;
    stringNum: number;
    noteName: string;
    // Provenance tag: one stable id per instrument + string set (protocol §7).
    // Grouping key for leave-one-guitar-out splits and per-family models.
    guitarId?: string;
    features: number[][];
    normalizedFeatures: number[][];
}

// Every pitched frame, emitted BEFORE the string range filter — observers
// (the guided session runner) need to see the notes the filter drops.
export interface EngineNoteEvent {
    midi: number;
    noteName: string;
    isOnset: boolean;
    accepted: boolean; // passed the current string's range filter
    rms: number;
    pitchConfidence: number;
}

export interface EngineSequenceEvent {
    midi: number;
    noteName: string;
    stringNum: number; // label the sequence was saved under
    isOnsetAnchored: boolean; // sequence starts at a pluck attack (one per pluck)
    datasetLength: number;
}

class GuitarAudioRecordingEngine {
    audioContext: AudioContext | null;
    gainNode: GainNode | null;
    workletNode: AudioWorkletNode | null;
    sourceNode: MediaStreamAudioSourceNode | null;
    backend: any | null; // Placeholder as actual backend is in worklet
    dataset: DatasetEntry[];
    isRecording: boolean;
    currentLabel: number;
    guitarId: string; // provenance tag stamped onto every captured sequence
    onDataCaptured: ((note: number, count: number) => void) | null;
    onNoteEvent: ((event: EngineNoteEvent) => void) | null;
    onSequenceCaptured: ((event: EngineSequenceEvent) => void) | null;
    private frameBuffer: { features: number[] }[] = [];
    private frameBufferStartsWithOnset = false;
    private lastFrameNote: number | null = null;
    private lastFrameTime: number = 0;
    private sharedBuffer: SharedArrayBuffer | null = null;
    private audioReader: AudioReader | null = null;
    private featureWorker: Worker | null = null;
    private pollingInterval: ReturnType<typeof setInterval> | null = null;
    // Highest autosave key that existed before this session started: rows at
    // or below it belong to a previous, crashed/unfinished session; rows
    // above it mirror sequences this session already holds in memory.
    private autosaveBoundary: Promise<number>;
    // True once the previous session's rows were restored or discarded —
    // only then may a download wipe the store completely.
    private autosaveConsumed = false;
    private autosaveWarned = false;

    constructor() {
        this.audioContext = null;
        this.gainNode = null;
        this.workletNode = null;
        this.sourceNode = null;
        this.backend = null;
        this.dataset = [];
        this.isRecording = false;
        this.currentLabel = 0; // Current String Index
        this.guitarId = '';
        this.onDataCaptured = null;
        this.onNoteEvent = null;
        this.onSequenceCaptured = null;
        this.frameBuffer = [];
        // Resolves in ms, long before the user can init the mic and record
        this.autosaveBoundary = maxAutosavedKey().catch(() => 0);
    }

    // Best-effort mirror of new sequences into IndexedDB; autosave failures
    // must never interrupt a recording session.
    private mirrorToAutosave(entries: DatasetEntry[]) {
        appendAutosaved(entries).catch((error) => {
            if (this.autosaveWarned) return;
            this.autosaveWarned = true;
            console.warn('Dataset autosave unavailable — a reload before Download will lose this session:', error);
        });
    }

    async setupPipeline() {
        if (this.audioContext && this.sourceNode) {
            if (this.workletNode) {
                this.workletNode.disconnect();
            }
            this.featureWorker?.terminate();

            // Capture worklet → raw-audio SAB → feature worker → feature SAB → engine.
            // The worklet only copies samples; all DSP runs in the worker so the
            // realtime audio thread never blocks on feature extraction.
            const audioSab = createRingBufferSab(AUDIO_RING_CAPACITY);
            this.sharedBuffer = createRingBufferSab(1024);
            this.audioReader = new AudioReader(new RingBuffer(this.sharedBuffer));

            this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor', { numberOfInputs: 1 });
            this.workletNode.port.postMessage({ command: 'sab', sab: audioSab });

            this.featureWorker = new Worker(new URL('./essentia-feature-worker.ts', import.meta.url), { type: 'module' });
            this.featureWorker.postMessage({
                command: 'init',
                audioSab,
                featureSab: this.sharedBuffer,
                sampleRate: this.audioContext.sampleRate,
                bufferSize: 2048
            });

            this.sourceNode.connect(this.workletNode);
            if (this.gainNode) {
                this.workletNode.connect(this.gainNode);
                this.gainNode.connect(this.audioContext.destination);
            }

            if (this.isRecording) {
                this.startPolling();
            } else {
                this.stopPolling();
            }
        } else {
            console.warn("Audio Context or Source Node not initialized yet.");
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
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 0;

            console.log("GuitarAudioEngine initialized");

            await this.setupPipeline();
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
            const accepted = range
                ? midiNote >= range.min && midiNote <= range.max
                : midiNote >= 40 && midiNote <= 90;

            this.onNoteEvent?.({
                midi: midiNote,
                noteName: this.getNoteNameFromMidi(midiNote),
                isOnset: features[FEATURE_POSITIONS.ONSET] > 0.5,
                accepted,
                rms: features[FEATURE_POSITIONS.RMS],
                pitchConfidence: features[FEATURE_POSITIONS.PITCH_CONFIDENCE]
            });

            if (!accepted) return;

            // Extract MFCCs
            const mfcc = Array.from(features.subarray(FEATURE_POSITIONS.MFCC_START, FEATURE_POSITIONS.MFCC_START + 13));

            const extraFeatures: Partial<AnalysisResult> = {
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
                this.saveData(mfcc, midiNote, extraFeatures);
            }
        }
    }

    saveData(mfcc: number[], note: number, extraFeatures: Partial<AnalysisResult> = {}) {
        if (!mfcc || mfcc.length !== FEATURE_CONFIG.MFCC_COUNT) {
            return;
        }

        // A sequence must be one note from one continuous pluck: discard
        // buffered frames when the note changes, the signal was interrupted,
        // or a new pluck onset arrives (sequences align to pluck boundaries).
        const now = performance.now();
        if (this.lastFrameNote !== note || now - this.lastFrameTime > MAX_FRAME_GAP_MS || extraFeatures.isOnset) {
            this.frameBuffer = [];
        }
        this.lastFrameNote = note;
        this.lastFrameTime = now;

        // Full feature set. Order is the model-input contract and must match
        // prediction-engine's makeSequencePrediction exactly.
        const harmonicsDb = extraFeatures.harmonicsDb ?? [];
        const tristimulus = extraFeatures.tristimulus ?? [];
        const currentFrameFeatures = [
            ...mfcc,
            note,
            extraFeatures.spectralCentroid || 0,
            extraFeatures.spectralFlux || 0,
            extraFeatures.spectralRolloff || 0,
            extraFeatures.inharmonicity || 0,
            extraFeatures.rms || 0,
            extraFeatures.inharmonicityB || 0,
            extraFeatures.isOnset ? 1 : 0,
            extraFeatures.snr || 0,
            ...Array.from({ length: HARMONIC_PARTIAL_COUNT }, (_, i) => harmonicsDb[i] ?? 0),
            tristimulus[0] ?? 0,
            tristimulus[1] ?? 0,
            tristimulus[2] ?? 0,
            extraFeatures.oddEvenRatio || 0
        ];

        if (currentFrameFeatures.some(f => f === null || f === undefined || isNaN(f))) return; // Strict check

        // Buffer the frame; remember whether this sequence starts at an attack
        if (this.frameBuffer.length === 0) {
            this.frameBufferStartsWithOnset = !!extraFeatures.isOnset;
        }
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
                guitarId: this.guitarId.trim() || undefined,
                features: this.frameBuffer.map(f => f.features),
                normalizedFeatures: []
            };

            this.dataset.push(sequenceEntry);
            this.mirrorToAutosave([sequenceEntry]);
            if (this.onDataCaptured) {
                this.onDataCaptured(note, this.dataset.length);
                console.log(`Captured sequence for ${this.getNoteNameFromMidi(note)}. Total sequences: ${this.dataset.length}`);
            }
            this.onSequenceCaptured?.({
                midi: note,
                noteName: sequenceEntry.noteName,
                stringNum: this.currentLabel,
                isOnsetAnchored: this.frameBufferStartsWithOnset,
                datasetLength: this.dataset.length
            });

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
        this.lastFrameNote = null;
        this.lastFrameTime = 0;

        console.log("Recording started for string", stringIndex);

        // Frames written to the feature SAB while polling was stopped belong
        // to earlier audio (previous string, pause noise); buffered now they
        // would be saved under the NEW label — overlapping string ranges let
        // them pass the filter. Discard the backlog.
        if (this.audioReader) {
            const stale = this.audioReader.available_read();
            if (stale > 0) this.audioReader.dequeue(new Float32Array(stale));
        }

        this.startPolling();
    }

    stopRecording() {
        this.isRecording = false;
        this.stopPolling();
        console.log("Recording stopped");
    }

    async downloadDataset() {
        const stats = calculateStatistics(this.dataset);
        const normalizedDataset = normalizeDataset(this.dataset, stats);
        this.saveJSONToFile(stats, `guitar_dataset_stats_${Date.now()}.json`);
        this.saveJSONToFile(normalizedDataset, `guitar_dataset_${Date.now()}.json`);

        // Everything in memory is on disk now, so its autosave mirror can go.
        // Un-restored rows of a previous session are NOT in this download —
        // keep them so the restore offer survives.
        try {
            const boundary = this.autosaveConsumed ? 0 : await this.autosaveBoundary;
            await clearAutosavedAbove(boundary);
            if (boundary > 0) {
                console.warn('Autosaved sequences from a previous session were kept — they are not part of this download. Restore or discard them in the Recording Studio.');
            }
        } catch (error) {
            console.warn('Could not clear the dataset autosave after download:', error);
        }
    }

    // Resumes a multi-day recording (protocol §3.4): appends the entries of a
    // previously downloaded dataset so new sequences accumulate on top of it
    // and the final download produces one dataset+stats pair whose stats are
    // computed over the whole pool. Entries must come from parseDatasetFile().
    importDataset(entries: DatasetEntry[]): number {
        this.dataset = this.dataset.concat(entries);
        this.mirrorToAutosave(entries);
        return this.dataset.length;
    }

    // Sequences a previous session left in the autosave (crash/reload before
    // Download). 0 once they were restored or discarded.
    async getPendingAutosaveCount(): Promise<number> {
        if (this.autosaveConsumed) return 0;
        try {
            return await countAutosavedUpTo(await this.autosaveBoundary);
        } catch {
            return 0;
        }
    }

    // Appends the previous session's autosaved rows to the in-memory dataset.
    // Rows above the boundary are this session's own captures — already in
    // memory — and must not be read back, or they would duplicate.
    async restoreAutosave(): Promise<number> {
        if (this.autosaveConsumed) return this.dataset.length;
        const boundary = await this.autosaveBoundary;
        if (boundary > 0) {
            const rows = await readAutosavedUpTo(boundary);
            if (rows.length > 0) {
                // Same contract as a file import: validate shape, strip stale
                // normalization. Throws (and stays pending) on corrupt rows.
                this.dataset = this.dataset.concat(parseDatasetFile(rows));
            }
        }
        this.autosaveConsumed = true;
        return this.dataset.length;
    }

    async discardAutosave(): Promise<void> {
        const boundary = await this.autosaveBoundary;
        await clearAutosavedUpTo(boundary);
        this.autosaveConsumed = true;
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