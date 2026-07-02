import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';
import { FEATURE_POSITIONS, type AudioBackend } from './worklet-types';

// SpectralPeaks tuning for Inharmonicity: the algorithm treats the first
// (lowest) peak as the fundamental, so peaks below the detected pitch must be
// excluded and near-silent noise peaks thresholded out.
const PEAK_MAGNITUDE_THRESHOLD = 1e-5;
const PEAK_MAX_FREQUENCY = 5000;
const PEAK_MAX_COUNT = 100;
// Tolerated relative deviation between the first spectral peak and the YIN pitch
const FUNDAMENTAL_TOLERANCE = 0.15;

export class EssentiaBackend implements AudioBackend {
    name = 'essentia';
    private essentia: any = null;
    private sampleRate: number = 44100;
    private lowestFreq: number = 440 * Math.pow(Math.pow(2, 1 / 12), -33); // C2 ~65Hz
    private highestFreq: number = 440 * Math.pow(Math.pow(2, 1 / 12), -33 + (6 * 12) - 1);

    async init(sampleRate: number, _bufferSize: number, _hopSize: number) {
        this.sampleRate = sampleRate;
        if (!this.essentia) {
            this.essentia = new Essentia(EssentiaWASM);
        }
    }

    // Returns null when any feature could not be extracted reliably; the frame
    // is dropped instead of being padded with zeros that are indistinguishable
    // from legitimate feature values.
    process(buffer: Float32Array): Float32Array | null {
        if (!this.essentia) return null;

        let vectorSignal: any = null;
        let windowedFrame: any = null;
        let spectrum: any = null;
        let peaksResult: any = null;

        try {
            vectorSignal = this.essentia.arrayToVector(buffer);

            const pitch = this.extractPitch(vectorSignal, buffer.length);
            if (pitch <= 0) return null; // unvoiced frame

            windowedFrame = this.essentia.Windowing(vectorSignal, true, buffer.length, "hamming").frame;
            spectrum = this.essentia.Spectrum(windowedFrame, buffer.length).spectrum;
            const spectrumSize = Math.floor(buffer.length / 2) + 1;

            // MFCC (defaults except inputSize and sampleRate)
            const mfccResult = this.essentia.MFCC(
                spectrum, 2, 11000, spectrumSize, 0, 'dbamp', 0, 'unit_sum', 40, 13, this.sampleRate
            );
            const mfcc = this.essentia.vectorToArray(mfccResult.mfcc);
            if (mfccResult.mfcc) mfccResult.mfcc.delete();
            if (mfccResult.bands) mfccResult.bands.delete();
            if (mfcc.length < 13 || mfcc.some(Number.isNaN)) return null;

            const spectralCentroid = this.essentia.Centroid(spectrum).centroid;
            const spectralRolloff = this.essentia.RollOff(spectrum, 0.85, this.sampleRate).rollOff;
            const spectralFlux = this.essentia.Flux(spectrum).flux;

            peaksResult = this.essentia.SpectralPeaks(
                spectrum,
                PEAK_MAGNITUDE_THRESHOLD,
                PEAK_MAX_FREQUENCY,
                PEAK_MAX_COUNT,
                pitch * (1 - FUNDAMENTAL_TOLERANCE),
                'frequency',
                this.sampleRate
            );
            if (!peaksResult.frequencies || peaksResult.frequencies.size() === 0) return null;

            // Inharmonicity treats the first peak as f0: require it to match the pitch
            const firstPeak = peaksResult.frequencies.get(0);
            if (Math.abs(firstPeak - pitch) > pitch * FUNDAMENTAL_TOLERANCE) return null;

            const inharmonicity = this.essentia.Inharmonicity(peaksResult.frequencies, peaksResult.magnitudes).inharmonicity;

            const scalars = [spectralCentroid, spectralRolloff, spectralFlux, inharmonicity];
            if (scalars.some(v => typeof v !== 'number' || Number.isNaN(v))) return null;

            const featureArray = new Float32Array(FEATURE_POSITIONS.TOTAL_FEATURES);
            featureArray[FEATURE_POSITIONS.PITCH] = pitch;
            for (let i = 0; i < 13; i++) {
                featureArray[FEATURE_POSITIONS.MFCC_START + i] = mfcc[i];
            }
            featureArray[FEATURE_POSITIONS.CENTROID] = spectralCentroid;
            featureArray[FEATURE_POSITIONS.ROLLOFF] = spectralRolloff;
            featureArray[FEATURE_POSITIONS.FLUX] = spectralFlux;
            featureArray[FEATURE_POSITIONS.INHARMONICITY] = inharmonicity;
            featureArray[FEATURE_POSITIONS.RMS] = 0; // Handled by caller
            return featureArray;
        } catch (e) {
            console.error("Essentia feature extraction failed", e);
            return null;
        } finally {
            if (vectorSignal) vectorSignal.delete();
            if (windowedFrame) windowedFrame.delete();
            if (spectrum) spectrum.delete();
            if (peaksResult) {
                if (peaksResult.frequencies) peaksResult.frequencies.delete();
                if (peaksResult.magnitudes) peaksResult.magnitudes.delete();
            }
        }
    }

    private extractPitch(vectorSignal: any, frameSize: number): number {
        let windowedFrame: any = null;
        let spectrum: any = null;
        try {
            windowedFrame = this.essentia.Windowing(vectorSignal).frame;
            spectrum = this.essentia.Spectrum(windowedFrame, frameSize).spectrum;
            const pitchResult = this.essentia.PitchYinFFT(spectrum, frameSize, true, this.highestFreq, this.lowestFreq, this.sampleRate);
            return typeof pitchResult.pitch === 'number' ? pitchResult.pitch : 0;
        } catch (e) {
            console.error("Essentia PitchYinFFT Error", e);
            return 0;
        } finally {
            if (windowedFrame) windowedFrame.delete();
            if (spectrum) spectrum.delete();
        }
    }
}
