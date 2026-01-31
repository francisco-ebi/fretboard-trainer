import Meyda from 'meyda';
import { YIN } from 'pitchfinder';
import type { AudioAnalysisBackend, AnalysisResult } from '@/utils/audio/audio-backend-types';

export class MeydaPitchfinderBackend implements AudioAnalysisBackend {
    name = 'meyda-pitchfinder';
    private detectPitch: ((buffer: Float32Array) => number | null) | null = null;

    async init(context: AudioContext) {
        this.detectPitch = YIN({ sampleRate: context.sampleRate });

        if (Meyda) {
            Meyda.audioContext = context;
            Meyda.bufferSize = 2048;
            Meyda.windowingFunction = "hamming";
        }
    }

    async process(buffer: Float32Array): Promise<AnalysisResult> {
        if (!this.detectPitch) return { pitch: null, mfcc: null };

        let pitch = this.detectPitch(buffer);

        let mfcc: number[] | null = null;
        let spectralCentroid: number | undefined;
        let spectralFlux: number | undefined;
        let spectralRolloff: number | undefined;

        try {
            // @ts-ignore
            const features = Meyda.extract(['mfcc', 'spectralCentroid', 'spectralRolloff'], buffer);
            // @ts-ignore
            if (features) {
                // @ts-ignore
                mfcc = features.mfcc;
                // @ts-ignore
                spectralCentroid = features.spectralCentroid;
                // @ts-ignore
                spectralFlux = features.spectralFlux;
                // @ts-ignore
                spectralRolloff = features.spectralRolloff;
            }
        } catch (e) {
            console.warn("Meyda extraction error", e);
        }

        return { pitch, mfcc, spectralCentroid, spectralFlux, spectralRolloff };
    }
}
