import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';
import type { AudioAnalysisBackend, AnalysisResult } from '@/utils/audio/audio-backend-types';

export class EssentiaBackend implements AudioAnalysisBackend {
    name = 'essentia-wasm';
    private essentia: any = null;


    async init(_context: AudioContext) {
        try {
            // @ts-ignore
            this.essentia = new Essentia(EssentiaWASM);
        } catch (e) {
            console.error("Failed to initialize Essentia WASM", e);
        }
    }

    async process(buffer: Float32Array): Promise<AnalysisResult> {
        if (!this.essentia) return { pitch: null, mfcc: null };

        try {
            const vectorSignal = this.essentia.arrayToVector(buffer);

            // Pitch
            let pitch = null;
            try {
                const pitchResult = this.essentia.PitchYin(vectorSignal);
                pitch = pitchResult.pitch;
                if (pitch && typeof pitch.size === 'function') { // Check if it's a vector
                    const vec = this.essentia.vectorToArray(pitch);
                    pitch = vec.length > 0 ? vec[0] : 0;
                    if (pitchResult.pitch && typeof pitchResult.pitch.delete === 'function') pitchResult.pitch.delete(); // Delete original vector
                }
                if (pitchResult.pitchConfidence && typeof pitchResult.pitchConfidence.size === 'function') {
                    if (pitchResult.pitchConfidence && typeof pitchResult.pitchConfidence.delete === 'function') pitchResult.pitchConfidence.delete();
                }
            } catch (e) {
                console.warn("Essentia Pitch Error:", e);
            }

            // Spectrum
            let spectrum = null;
            let windowedFrame = null;
            try {
                const windowed = this.essentia.Windowing(vectorSignal, true, buffer.length, "hamming");
                windowedFrame = windowed.frame;
                spectrum = this.essentia.Spectrum(windowedFrame);
            } catch (e) {
                console.warn("Essentia Spectrum Error:", e);
                if (vectorSignal && typeof vectorSignal.delete === 'function') vectorSignal.delete(); // Fail early cleanup
                return { pitch, mfcc: null };
            }

            // MFCC
            let mfcc = [];
            try {
                const mfccResult = this.essentia.MFCC(spectrum.spectrum);
                mfcc = this.essentia.vectorToArray(mfccResult.mfcc);
                if (mfccResult.mfcc && typeof mfccResult.mfcc.delete === 'function') mfccResult.mfcc.delete();
                if (mfccResult.bands && typeof mfccResult.bands.delete === 'function') mfccResult.bands.delete();
            } catch (e) {
                console.warn("Essentia MFCC Error:", e);
            }

            // Spectral Centroid
            let spectralCentroid = null;
            try {
                const centroidResult = this.essentia.Centroid(spectrum.spectrum);
                let sc = centroidResult.centroid;
                if (sc && typeof sc.size === 'function') {
                    const vec = this.essentia.vectorToArray(sc);
                    sc = vec.length > 0 ? vec[0] : 0;
                    if (centroidResult.centroid && typeof centroidResult.centroid.delete === 'function') centroidResult.centroid.delete();
                }
                spectralCentroid = sc;
            } catch (e) {
                console.warn("Essentia Centroid Error:", e);
            }

            // Spectral Rolloff
            let spectralRolloff = null;
            try {
                const rolloffResult = this.essentia.RollOff(spectrum.spectrum);
                let sr = rolloffResult.rollOff;
                if (sr && typeof sr.size === 'function') {
                    const vec = this.essentia.vectorToArray(sr);
                    sr = vec.length > 0 ? vec[0] : 0;
                    if (rolloffResult.rollOff && typeof rolloffResult.rollOff.delete === 'function') rolloffResult.rollOff.delete();
                }
                spectralRolloff = sr;
            } catch (e) {
                console.warn("Essentia Rolloff Error:", e);
            }

            // Spectral Flux
            let spectralFlux = null;
            try {
                const fluxResult = this.essentia.Flux(spectrum.spectrum);
                let sf = fluxResult.flux;
                if (sf && typeof sf.size === 'function') {
                    const vec = this.essentia.vectorToArray(sf);
                    sf = vec.length > 0 ? vec[0] : 0;
                    if (fluxResult.flux && typeof fluxResult.flux.delete === 'function') fluxResult.flux.delete();
                }
                spectralFlux = sf;
            } catch (e) {
                console.warn("Essentia Flux Error:", e);
            }

            // Inharmonicity
            let inharmonicity = null;
            try {
                const peaksResult = this.essentia.SpectralPeaks(spectrum.spectrum);

                // Ensure pitch is a number and sensible (e.g. > 0)
                if (typeof pitch === 'number' && pitch > 0) {
                    const inharmonicityResult = this.essentia.Inharmonicity(peaksResult.frequencies, peaksResult.magnitudes);
                    let inh = inharmonicityResult.inharmonicity;
                    if (inh && typeof inh.size === 'function') {
                        const vec = this.essentia.vectorToArray(inh);
                        inh = vec.length > 0 ? vec[0] : 0;
                        if (inharmonicityResult.inharmonicity && typeof inharmonicityResult.inharmonicity.delete === 'function') inharmonicityResult.inharmonicity.delete();
                    }
                    inharmonicity = inh;
                }
                if (peaksResult.frequencies && typeof peaksResult.frequencies.delete === 'function') peaksResult.frequencies.delete();
                if (peaksResult.magnitudes && typeof peaksResult.magnitudes.delete === 'function') peaksResult.magnitudes.delete();
            } catch (e) {
                console.warn("Essentia Inharmonicity Error:", e);
            }

            // Cleanup
            try {
                if (vectorSignal && typeof vectorSignal.delete === 'function') vectorSignal.delete();
                if (windowedFrame && typeof windowedFrame.delete === 'function') windowedFrame.delete();
                if (spectrum.spectrum && typeof spectrum.spectrum.delete === 'function') spectrum.spectrum.delete();
            } catch (e) {
                console.warn("Essentia Cleanup Error:", e);
            }

            return {
                pitch,
                mfcc: Array.from(mfcc),
                spectralCentroid,
                spectralFlux,
                spectralRolloff,
                inharmonicity
            };

        } catch (e) {
            console.error("Essentia Fatal Process Error:", e);
            return { pitch: null, mfcc: null };
        }
    }
}
