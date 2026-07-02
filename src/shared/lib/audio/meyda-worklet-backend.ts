import Meyda from 'meyda';
import { YIN, Macleod } from 'pitchfinder';
import { FEATURE_POSITIONS, type AudioBackend } from './worklet-types';

// Developer Config: Choose pitch detection algorithm ('yin' or 'macleod')
const PITCH_ALGORITHM: 'yin' | 'macleod' = 'macleod';

export class MeydaBackend implements AudioBackend {
    name = 'meyda';
    private detectPitch: ((buffer: Float32Array) => number | null) | null = null;

    async init(sampleRate: number, bufferSize: number, _hopSize: number) {
        if (PITCH_ALGORITHM === 'macleod') {
            const macleodDetector = Macleod({ sampleRate, bufferSize });
            this.detectPitch = (buffer: Float32Array) => {
                const result = macleodDetector(buffer);
                return result && result.probability > 0.5 ? result.freq : null;
            };
        } else {
            this.detectPitch = YIN({ sampleRate });
        }

        if (Meyda) {
            Meyda.bufferSize = bufferSize;
            // Meyda defaults to 44100; the mel filterbank and rolloff are wrong
            // on 48kHz hardware unless the real context rate is set.
            // (property exists at runtime but is missing from meyda's typings)
            (Meyda as any).sampleRate = sampleRate;
            Meyda.windowingFunction = "hamming";
        }
    }

    // Returns null when any feature could not be extracted reliably; the frame
    // is dropped instead of being padded with zeros that are indistinguishable
    // from legitimate feature values.
    process(buffer: Float32Array): Float32Array | null {
        if (!this.detectPitch) return null;

        const pitch = this.detectPitch(buffer);
        if (!pitch || pitch <= 0) return null; // unvoiced frame

        let mfcc: number[] | null = null;
        let spectralCentroid: number | null = null;
        let spectralRolloff: number | null = null;

        try {
            // @ts-ignore
            const features = Meyda.extract(['mfcc', 'spectralCentroid', 'spectralRolloff'], buffer);
            // @ts-ignore
            if (features) {
                // @ts-ignore
                mfcc = features.mfcc || null;
                // @ts-ignore
                spectralCentroid = typeof features.spectralCentroid === 'number' ? features.spectralCentroid : null;
                // @ts-ignore
                spectralRolloff = typeof features.spectralRolloff === 'number' ? features.spectralRolloff : null;
            }
        } catch (e) {
            console.error("Meyda extraction error", e);
            return null;
        }

        if (!mfcc || mfcc.length < 13 || mfcc.some(Number.isNaN)) return null;
        if (spectralCentroid === null || Number.isNaN(spectralCentroid)) return null;
        if (spectralRolloff === null || Number.isNaN(spectralRolloff)) return null;

        // Serialize
        const featureArray = new Float32Array(FEATURE_POSITIONS.TOTAL_FEATURES);
        featureArray[FEATURE_POSITIONS.PITCH] = pitch;

        for (let i = 0; i < 13; i++) {
            featureArray[FEATURE_POSITIONS.MFCC_START + i] = mfcc[i];
        }

        featureArray[FEATURE_POSITIONS.CENTROID] = spectralCentroid;
        featureArray[FEATURE_POSITIONS.ROLLOFF] = spectralRolloff;
        featureArray[FEATURE_POSITIONS.FLUX] = 0; // Not available in Meyda (needs previous frame)
        featureArray[FEATURE_POSITIONS.INHARMONICITY] = 0; // Not available in Meyda
        featureArray[FEATURE_POSITIONS.RMS] = 0; // Handled by caller

        return featureArray;
    }
}
