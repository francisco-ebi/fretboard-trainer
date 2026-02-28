import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';
import type { AudioBackend, AnalysisResult } from './worklet-types';

export class EssentiaBackend implements AudioBackend {
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
