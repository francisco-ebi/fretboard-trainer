import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';
import { FEATURE_POSITIONS, type AudioBackend } from './worklet-types';

export class EssentiaBackend implements AudioBackend {
    name = 'essentia';
    private essentia: any = null;
    private bufferSize: number = 2048;
    private sampleRate: number = 44100;
    private lowestFreq: number = 440 * Math.pow(Math.pow(2, 1 / 12), -33); // C2 ~65Hz
    private highestFreq: number = 440 * Math.pow(Math.pow(2, 1 / 12), -33 + (6 * 12) - 1);

    async init(sampleRate: number, bufferSize: number, _hopSize: number) {
        this.bufferSize = bufferSize;
        this.sampleRate = sampleRate;
        if (!this.essentia) {
            this.essentia = new Essentia(EssentiaWASM);
        }
    }

    process(buffer: Float32Array): Float32Array {
        if (!this.essentia) return new Float32Array(FEATURE_POSITIONS.TOTAL_FEATURES);

        let vectorSignal;
        try {
            vectorSignal = this.essentia.arrayToVector(buffer);
        } catch (e) {
            console.error("Essentia arrayToVector failed", e);
            return new Float32Array(FEATURE_POSITIONS.TOTAL_FEATURES);
        }

        // Pitch detection using PitchYinFFT
        const pitch = this.extractPitch(vectorSignal);

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
            return new Float32Array(FEATURE_POSITIONS.TOTAL_FEATURES);
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

        // Serialize
        const featureArray = new Float32Array(FEATURE_POSITIONS.TOTAL_FEATURES);
        featureArray[FEATURE_POSITIONS.PITCH] = pitch || 0;

        for (let i = 0; i < 13; i++) {
            featureArray[FEATURE_POSITIONS.MFCC_START + i] = mfcc[i] || 0;
        }

        featureArray[FEATURE_POSITIONS.CENTROID] = spectralCentroid || 0;
        featureArray[FEATURE_POSITIONS.ROLLOFF] = spectralRolloff || 0;
        featureArray[FEATURE_POSITIONS.FLUX] = spectralFlux || 0;
        featureArray[FEATURE_POSITIONS.INHARMONICITY] = inharmonicity || 0;
        featureArray[FEATURE_POSITIONS.RMS] = 0; // Handled by caller
        return featureArray;
    }

    private extractPitch(vectorSignal: any): number {
        let pitch = 0;
        try {
            const windowedFrame = this.essentia.Windowing(vectorSignal).frame;
            const spectrum = this.essentia.Spectrum(windowedFrame, windowedFrame.size()).spectrum;
            const pitchResult = this.essentia.PitchYinFFT(spectrum, spectrum.size() - 1, true, this.highestFreq, this.lowestFreq, this.sampleRate);
            if (typeof pitchResult.pitch === 'number') {
                pitch = pitchResult.pitch;
            }

            // Cleanup temp vectors
            if (windowedFrame) windowedFrame.delete();
            if (spectrum) spectrum.delete();
        } catch (e) {
            console.error("Essentia PitchYinFFT Error", e);
        }
        return pitch;
    }
}
