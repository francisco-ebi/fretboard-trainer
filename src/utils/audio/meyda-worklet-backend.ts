import Meyda from 'meyda';
import { YIN, Macleod } from 'pitchfinder';
import type { AudioBackend, AnalysisResult } from './worklet-types';

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
