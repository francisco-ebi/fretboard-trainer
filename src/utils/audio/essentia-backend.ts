// @ts-ignore
import { EssentiaWASM } from 'essentia.js';
import type { AudioAnalysisBackend, AnalysisResult } from '@/utils/audio/audio-backend-types';

export class EssentiaBackend implements AudioAnalysisBackend {
    name = 'essentia-wasm';
    private essentia: any = null;

    async init(_context: AudioContext) {
        try {
            // @ts-ignore
            this.essentia = new EssentiaWASM.EssentiaWASM();
        } catch (e) {
            console.error("Failed to initialize Essentia WASM", e);
        }
    }

    async process(buffer: Float32Array): Promise<AnalysisResult> {
        if (!this.essentia) return { pitch: null, mfcc: null };

        const vectorSignal = this.essentia.arrayToVector(buffer);

        const pitchResult = this.essentia.PitchYin(vectorSignal);
        const pitch = pitchResult.pitch;

        const windowed = this.essentia.Windowing(vectorSignal, "hamming", "no");
        const spectrum = this.essentia.Spectrum(windowed.frame);
        const mfccResult = this.essentia.MFCC(spectrum.spectrum);

        const mfcc = this.essentia.vectorToArray(mfccResult.mfcc);

        this.essentia.deleteVector(vectorSignal);
        this.essentia.deleteVector(windowed.frame);
        this.essentia.deleteVector(spectrum.spectrum);
        this.essentia.deleteVector(mfccResult.mfcc);
        this.essentia.deleteVector(mfccResult.bands);
        this.essentia.deleteVector(pitchResult.pitch);

        return { pitch: pitch, mfcc: Array.from(mfcc) };
    }
}
