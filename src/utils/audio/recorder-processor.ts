import Meyda from 'meyda';
import { YIN, Macleod } from 'pitchfinder';

// Developer Config: Choose pitch detection algorithm ('yin' or 'macleod')
const PITCH_ALGORITHM: 'yin' | 'macleod' = 'yin';

declare const sampleRate: number;

interface AnalysisResult {
    pitch: number | null;
    mfcc: number[] | null;
    rms?: number;
    spectralCentroid?: number | null;
    spectralFlux?: number | null;
    spectralRolloff?: number | null;
    inharmonicity?: number | null;
}

interface AudioBackend {
    name: string;
    init(sampleRate: number): Promise<void>;
    process(buffer: Float32Array, stringIndex: number): AnalysisResult;
}


class MeydaBackend implements AudioBackend {
    name = 'meyda';
    private detectPitch: ((buffer: Float32Array) => number | null) | null = null;

    async init(sampleRate: number) {
        if (PITCH_ALGORITHM === 'macleod') {
            const macleodDetector = Macleod({ sampleRate, bufferSize: 2048 });
            this.detectPitch = (buffer: Float32Array) => {
                const result = macleodDetector(buffer);
                return result && result.probability > 0.5 ? result.freq : null;
            };
        } else {
            this.detectPitch = YIN({ sampleRate });
        }

        // Meyda configuration if needed, typically synchronous or setup on frame
        if (Meyda) {
            Meyda.bufferSize = 2048;
            Meyda.windowingFunction = "hamming";
        }
    }

    process(buffer: Float32Array): AnalysisResult {
        if (!this.detectPitch) return { pitch: null, mfcc: null };

        const pitch = this.detectPitch(buffer);

        let mfcc: number[] | null = null;
        let spectralCentroid: number | null = null;
        let spectralRolloff: number | null = null;
        let spectralFlux: number | null = null;

        try {
            // @ts-ignore
            const features = Meyda.extract(['mfcc', 'spectralCentroid', 'spectralRolloff'], buffer);
            // @ts-ignore
            if (features) {
                // @ts-ignore
                mfcc = features.mfcc || null;
                // @ts-ignore
                spectralCentroid = features.spectralCentroid || null;
                // @ts-ignore
                spectralRolloff = features.spectralRolloff || null;
            }
        } catch (e) {
            // console.warn("Meyda extraction error", e);
        }

        return { pitch, mfcc, spectralCentroid, spectralRolloff, spectralFlux, inharmonicity: null };
    }
}

class RecorderProcessor extends AudioWorkletProcessor {
    bufferSize: number;
    hopSize: number;
    buffer: Float32Array;
    currentSize: number;
    activeBackend: AudioBackend;
    stringIndex: number = 0;

    constructor() {
        super();
        this.bufferSize = 2048;
        this.hopSize = 1024;
        this.buffer = new Float32Array(this.bufferSize);
        this.currentSize = 0;

        this.activeBackend = new MeydaBackend();
        this.activeBackend.init(sampleRate).catch(console.error);

        this.port.onmessage = (event) => {
            if (event.data.command === 'setString') {
                console.log("Setting string", event.data.stringIndex);
                this.setString(event.data.stringIndex);
            }
        };
    }

    async setString(stringIndex: number) {
        this.stringIndex = stringIndex;
    }

    process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const input = inputs[0];
        if (!input || input.length === 0) return true;

        const channelData = input[0];
        if (!channelData || channelData.length === 0) return true;

        for (let i = 0; i < channelData.length; i++) {
            if (this.currentSize >= this.bufferSize) {
                this.shiftBuffer();
            }

            this.buffer[this.currentSize] = channelData[i];
            this.currentSize++;

            if (this.currentSize >= this.bufferSize) {
                const bufferToSend = new Float32Array(this.buffer);
                const rms = this.calculateRMS(bufferToSend);

                if (rms > 0.02 && this.activeBackend) {
                    try {
                        const result = this.activeBackend.process(bufferToSend, this.stringIndex);
                        result.rms = rms;
                        this.port.postMessage(result);
                    } catch (err) {
                        console.error("[AudioWorklet] Process error:", err);
                    }
                }

                this.shiftBuffer();
            }
        }

        return true;
    }

    shiftBuffer() {
        const overlapSize = this.bufferSize - this.hopSize;
        this.buffer.copyWithin(0, this.hopSize);
        this.currentSize = overlapSize;
    }

    calculateRMS(data: Float32Array): number {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i] * data[i];
        }
        return Math.sqrt(sum / data.length);
    }
}

registerProcessor('recorder-processor', RecorderProcessor);