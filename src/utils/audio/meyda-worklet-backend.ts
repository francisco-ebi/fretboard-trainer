import Meyda from 'meyda';
import { YIN, Macleod } from 'pitchfinder';
import { FEATURE_POSITIONS, type AudioBackend } from './worklet-types';

// Developer Config: Choose pitch detection algorithm ('yin' or 'macleod')
const PITCH_ALGORITHM: 'yin' | 'macleod' = 'macleod';

export class MeydaBackend implements AudioBackend {
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

    process(buffer: Float32Array): Float32Array {
        if (!this.detectPitch) return new Float32Array(FEATURE_POSITIONS.TOTAL_FEATURES);

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

        // Serialize
        const featureArray = new Float32Array(FEATURE_POSITIONS.TOTAL_FEATURES);
        featureArray[FEATURE_POSITIONS.PITCH] = pitch || 0;

        for (let i = 0; i < 13; i++) {
            featureArray[FEATURE_POSITIONS.MFCC_START + i] = mfcc ? mfcc[i] || 0 : 0;
        }

        featureArray[FEATURE_POSITIONS.CENTROID] = spectralCentroid || 0;
        featureArray[FEATURE_POSITIONS.ROLLOFF] = spectralRolloff || 0;
        featureArray[FEATURE_POSITIONS.FLUX] = spectralFlux || 0;
        featureArray[FEATURE_POSITIONS.INHARMONICITY] = 0; // Not available in Meyda
        featureArray[FEATURE_POSITIONS.RMS] = 0; // Handled by caller

        return featureArray;
    }
}
