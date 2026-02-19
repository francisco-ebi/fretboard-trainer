import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';
import Meyda from 'meyda';
import { YIN } from 'pitchfinder';

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

class EssentiaBackend implements AudioBackend {
    name = 'essentia';
    private essentia: any = null;

    async init(_sampleRate: number) {
        if (!this.essentia) {
            // @ts-ignore
            this.essentia = new Essentia(EssentiaWASM);
        }
    }

    process(buffer: Float32Array): AnalysisResult {
        if (!this.essentia) return { pitch: null, mfcc: null };

        let vectorSignal;
        try {
            vectorSignal = this.essentia.arrayToVector(buffer);
        } catch (e) {
            console.error("Essentia arrayToVector failed", e);
            return { pitch: null, mfcc: null };
        }

        // Pitch
        let pitch = null;
        try {
            const pitchResult = this.essentia.PitchYin(vectorSignal);
            if (typeof pitchResult.pitch === 'number') {
                pitch = pitchResult.pitch;
            }
        } catch (e) {
            // console.warn("Essentia Pitch Error", e);
        }

        let spectrum = null;
        let windowedFrame = null;

        // Features container
        let mfcc: number[] = [];
        let spectralCentroid: number | null = null;
        let spectralFlux: number | null = null;
        let spectralRolloff: number | null = null;
        let inharmonicity: number | null = null;

        try {
            const windowed = this.essentia.Windowing(vectorSignal, true, buffer.length, "hamming");
            windowedFrame = windowed.frame;
            spectrum = this.essentia.Spectrum(windowedFrame);
        } catch (e) {
            if (vectorSignal) vectorSignal.delete();
            return { pitch, mfcc: null };
        }

        // MFCC
        try {
            const mfccResult = this.essentia.MFCC(spectrum.spectrum);
            mfcc = this.essentia.vectorToArray(mfccResult.mfcc);
            if (mfccResult.mfcc) mfccResult.mfcc.delete();
            if (mfccResult.bands) mfccResult.bands.delete();
        } catch (e) {
            console.error("MFCC: ", e);
        }

        // Centroid
        try {
            const result = this.essentia.Centroid(spectrum.spectrum);
            if (typeof result.centroid === 'number') {
                spectralCentroid = result.centroid;
            }
        } catch (e) {
            console.error("Centroid: ", e);
        }

        // Rolloff
        try {
            const result = this.essentia.RollOff(spectrum.spectrum);
            if (typeof result.rollOff === 'number') {
                spectralRolloff = result.rollOff;
            }
        } catch (e) {
            console.error("Rolloff: ", e);
        }

        // Flux
        try {
            const result = this.essentia.Flux(spectrum.spectrum);
            if (typeof result.flux === 'number') {
                spectralFlux = result.flux;
            }
        } catch (e) {
            console.error("Flux: ", e);
        }

        // Inharmonicity
        if (pitch && pitch > 0) {
            let peaksResult;
            try {
                peaksResult = this.essentia.SpectralPeaks(
                    spectrum.spectrum,
                    0,
                    5000,
                    100
                );

                // Validation to minimize exceptions in Inharmonicity
                // It requires non-empty vectors and no 0Hz peak (or negative)
                let validInputs = false;
                if (peaksResult.frequencies && peaksResult.magnitudes && peaksResult.frequencies.size() > 0) {
                    const firstFreq = peaksResult.frequencies.get(0);
                    if (firstFreq > 0.0001) {
                        validInputs = true;
                    }
                }

                if (validInputs) {
                    const result = this.essentia.Inharmonicity(peaksResult.frequencies, peaksResult.magnitudes);
                    if (typeof result.inharmonicity === 'number') {
                        inharmonicity = result.inharmonicity;
                    }
                    if (result.inharmonicity && typeof result.inharmonicity !== 'number') {
                        // In case it returned a vector/object unexpectedly in future versions, handle cleanup if needed.
                        // But we expect number here as per previous fix.
                        // For now, based on previous fix, it's a number.
                    }
                }

            } catch (e) {
                console.error('Inharmonicity:', e);
            } finally {
                if (peaksResult) {
                    if (peaksResult.frequencies) peaksResult.frequencies.delete();
                    if (peaksResult.magnitudes) peaksResult.magnitudes.delete();
                }
            }
        }

        // Cleanup
        if (vectorSignal) vectorSignal.delete();
        if (windowedFrame) windowedFrame.delete();
        if (spectrum && spectrum.spectrum) spectrum.spectrum.delete();

        return {
            pitch,
            mfcc: Array.from(mfcc),
            spectralCentroid,
            spectralFlux,
            spectralRolloff,
            inharmonicity
        };
    }
}

class MeydaBackend implements AudioBackend {
    name = 'meyda';
    private detectPitch: ((buffer: Float32Array) => number | null) | null = null;

    async init(sampleRate: number) {
        this.detectPitch = YIN({ sampleRate });
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
    activeBackend: AudioBackend | null = null;
    backends: Map<string, AudioBackend> = new Map();
    stringIndex: number = 0;

    constructor() {
        super();
        this.bufferSize = 2048;
        this.hopSize = 1024;
        this.buffer = new Float32Array(this.bufferSize);
        this.currentSize = 0;

        // Register backends
        this.backends.set('essentia', new EssentiaBackend());
        this.backends.set('meyda', new MeydaBackend());

        // Default to Meyda initially or wait for command
        this.activeBackend = this.backends.get('meyda') || null;

        this.port.onmessage = (event) => {
            if (event.data.command === 'setBackend') {
                this.setBackend(event.data.type);
            }
            if (event.data.command === 'setString') {
                console.log("Setting string", event.data.stringIndex);
                this.setString(event.data.stringIndex);
            }
        };
    }

    async setBackend(type: string) {
        const backend = this.backends.get(type);
        if (backend) {
            // Note: sampleRate is a global in AudioWorkletGlobalScope
            await backend.init(sampleRate);
            this.activeBackend = backend;
            console.log(`[AudioWorklet] Switched to ${backend.name}`);
        } else {
            console.warn(`[AudioWorklet] Backend ${type} not found`);
        }
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