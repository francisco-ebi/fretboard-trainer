// @ts-ignore
import { EssentiaWASM } from 'essentia.js';
import type { AudioAnalysisBackend, AnalysisResult } from '@/utils/audio/audio-backend-types';

export class EssentiaBackend implements AudioAnalysisBackend {
    name = 'essentia-wasm';
    private essentia: any = null;
    private previousSpectrum: any = null; // Vector to hold previous frame spectrum

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

        // Pitch
        const pitchResult = this.essentia.PitchYin(vectorSignal);
        // PitchYin returns { pitch, pitchConfidence } where fields are float in JS bindings (not vector usually for single frame?)
        // Standard EssentiaJS wrapper often un-vectors single values. 
        // Let's verify by safety checking: if it has length, it's a vector. If number, it's a number.
        // ACTUALLY, checking previous code, `const pitch = pitchResult.pitch` suggests it was treated as a value (or the interface allowed any).
        // To be safe, let's treat it as potential vector.
        let pitch = pitchResult.pitch;
        if (pitch && typeof pitch.size === 'function') { // Check if it's a vector
            const vec = this.essentia.vectorToArray(pitch);
            pitch = vec.length > 0 ? vec[0] : 0;
            this.essentia.deleteVector(pitchResult.pitch); // Delete original vector
        }
        if (typeof pitchResult.pitchConfidence?.size === 'function') {
            this.essentia.deleteVector(pitchResult.pitchConfidence);
        }

        // Spectrum
        const windowed = this.essentia.Windowing(vectorSignal, "hamming", "no");
        const spectrum = this.essentia.Spectrum(windowed.frame);

        // MFCC
        const mfccResult = this.essentia.MFCC(spectrum.spectrum);
        const mfcc = this.essentia.vectorToArray(mfccResult.mfcc);

        // Spectral Centroid
        const centroidResult = this.essentia.Centroid(spectrum.spectrum);
        let spectralCentroid = centroidResult.centroid;
        if (spectralCentroid && typeof spectralCentroid.size === 'function') {
            const vec = this.essentia.vectorToArray(spectralCentroid);
            spectralCentroid = vec.length > 0 ? vec[0] : 0;
            this.essentia.deleteVector(centroidResult.centroid);
        }

        // Spectral Rolloff
        const rolloffResult = this.essentia.RollOff(spectrum.spectrum);
        let spectralRolloff = rolloffResult.rollOff;
        if (spectralRolloff && typeof spectralRolloff.size === 'function') {
            const vec = this.essentia.vectorToArray(spectralRolloff);
            spectralRolloff = vec.length > 0 ? vec[0] : 0;
            this.essentia.deleteVector(rolloffResult.rollOff);
        }

        // Spectral Flux
        let spectralFlux = 0;
        if (this.previousSpectrum) {
            const fluxResult = this.essentia.Flux(spectrum.spectrum, this.previousSpectrum);
            let flux = fluxResult.flux;
            if (flux && typeof flux.size === 'function') {
                const vec = this.essentia.vectorToArray(flux);
                flux = vec.length > 0 ? vec[0] : 0;
                this.essentia.deleteVector(fluxResult.flux);
            }
            spectralFlux = flux;

            // Clean up old previous
            this.essentia.deleteVector(this.previousSpectrum);
        }

        // Store current spectrum for next frame
        const spectrumArray = this.essentia.vectorToArray(spectrum.spectrum);
        this.previousSpectrum = this.essentia.arrayToVector(spectrumArray);


        // Cleanup
        this.essentia.deleteVector(vectorSignal);
        this.essentia.deleteVector(windowed.frame);
        this.essentia.deleteVector(spectrum.spectrum);
        this.essentia.deleteVector(mfccResult.mfcc);
        this.essentia.deleteVector(mfccResult.bands);

        return {
            pitch, // Should be number or null
            mfcc: Array.from(mfcc),
            spectralCentroid,
            spectralFlux,
            spectralRolloff
        };
    }
}
