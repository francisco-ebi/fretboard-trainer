import Meyda from 'meyda';
import { YIN } from 'pitchfinder';

// Vite Worker Import
import processorUrl from './recorder-processor.ts?url'; // Use .ts for import, Vite handles it. Actually, Vite expects strict worker imports. If we import ?url, it's just a string URL.

interface DatasetEntry {
    mfcc: number[];
    midiNote: number;
    stringNum: number;
    noteName: string;
}

class GuitarAudioEngine {
    audioContext: AudioContext | null;
    workletNode: AudioWorkletNode | null;
    detectPitch: ((buffer: Float32Array) => number | null) | null;
    dataset: DatasetEntry[];
    isRecording: boolean;
    currentLabel: number;
    onDataCaptured: ((note: number, count: number) => void) | null;

    constructor() {
        this.audioContext = null;
        this.workletNode = null;
        this.detectPitch = null;
        this.dataset = [];
        this.isRecording = false;
        this.currentLabel = 0; // Current String Index
        this.onDataCaptured = null;
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
            console.log("GuitarAudioEngine initialized");
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
                    this.saveData(mfccs, midiNote);
                }
            } catch (e) {
                // Ignore frame errors
            }
        }
    }

    saveData(mfcc: number[] | Float32Array, note: number) {
        const noteName = this.getNoteNameFromMidi(note);
        console.log({ mfcc, note, noteName });
        this.dataset.push({
            mfcc: Array.from(mfcc),
            midiNote: note,
            stringNum: this.currentLabel,
            noteName
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
    }

    stopRecording() {
        this.isRecording = false;
    }

    downloadDataset() {
        const blob = new Blob([JSON.stringify(this.dataset, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `guitar_dataset_${Date.now()}.json`;
        a.click();
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

export const audioEngine = new GuitarAudioEngine();