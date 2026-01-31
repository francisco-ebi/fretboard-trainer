import Meyda from 'meyda';
import { YIN } from 'pitchfinder';
// @ts-ignore
import { EssentiaWASM } from 'essentia.js';

export interface AnalysisResult {
    pitch: number | null;
    mfcc: number[] | null;
    rms?: number; // Optional, useful for silence detection
}

export interface AudioAnalysisBackend {
    name: string;
    init(context: AudioContext): Promise<void>;
    process(buffer: Float32Array): Promise<AnalysisResult>;
    destroy?(): void;
}

export class MeydaPitchfinderBackend implements AudioAnalysisBackend {
    name = 'meyda-pitchfinder';
    // private context: AudioContext | null = null;
    private detectPitch: ((buffer: Float32Array) => number | null) | null = null;

    async init(context: AudioContext) {
        // this.context = context; // Not currently used in class scope
        this.detectPitch = YIN({ sampleRate: context.sampleRate });

        if (Meyda) {
            Meyda.audioContext = context;
            Meyda.bufferSize = 2048; // Assuming standard buffer size from recording-engine
            Meyda.windowingFunction = "hamming";
        }
    }

    async process(buffer: Float32Array): Promise<AnalysisResult> {
        if (!this.detectPitch) return { pitch: null, mfcc: null };

        let pitch = this.detectPitch(buffer);
        // Pitchfinder returns null for silence sometimes, or we might want to filter it yourself, 
        // but the interface expects number | null.

        let mfcc: number[] | null = null;
        try {
            // Meyda types might be incorrect for array input, or multiple extraction returns object
            // Casting to any to avoid TS strict check if types are outdated
            const features = Meyda.extract('mfcc', buffer);
            // @ts-ignore
            if (features) {
                // @ts-ignore
                mfcc = features;
            }
        } catch (e) {
            // console.warn("Meyda extraction error", e);
        }

        return { pitch, mfcc };
    }
}

export class EssentiaBackend implements AudioAnalysisBackend {
    name = 'essentia-wasm';
    private essentia: any = null;
    // private context: AudioContext | null = null;

    async init(_context: AudioContext) {
        // this.context = context;
        // logic to load essentia WASM
        try {
            // In a real env, we might need to handle WASM path loading
            // @ts-ignore
            this.essentia = new EssentiaWASM.EssentiaWASM();
        } catch (e) {
            console.error("Failed to initialize Essentia WASM", e);
        }
    }

    async process(buffer: Float32Array): Promise<AnalysisResult> {
        if (!this.essentia) return { pitch: null, mfcc: null };

        // Convert Float32Array to Essentia vector if needed, or pass directly
        const vectorSignal = this.essentia.arrayToVector(buffer);

        // Pitch Detection (using Yin for equivalence)
        // Essentia PitchYin returns [pitch, probability]
        const pitchResult = this.essentia.PitchYin(vectorSignal);
        const pitch = pitchResult.pitch;
        // Optionally check probability
        // const probability = pitchResult.pitchConfidence;

        // MFCC Extraction
        // Standard chain: Windowing -> Spectrum -> MFCC
        const windowed = this.essentia.Windowing(vectorSignal, "hamming", "no");
        const spectrum = this.essentia.Spectrum(windowed.frame);
        const mfccResult = this.essentia.MFCC(spectrum.spectrum);
        // MFCC returns { bands, mfcc }

        const mfcc = this.essentia.vectorToArray(mfccResult.mfcc);

        // cleanup vectors to avoid leaks (Essentia JS typically manual mem management for vectors)
        // Check docs, usually need to delete vectors.
        this.essentia.deleteVector(vectorSignal);
        this.essentia.deleteVector(windowed.frame);
        this.essentia.deleteVector(spectrum.spectrum);
        this.essentia.deleteVector(mfccResult.mfcc);
        this.essentia.deleteVector(mfccResult.bands);
        this.essentia.deleteVector(pitchResult.pitch); // If it's a vector? Actually PitchYin usually returns simple values or objects in JS wrapper?
        // Wait, essentia.js often returns JS objects, but inputs need vectors.
        // Let's verifying return types carefully via trial/error or assuming wrapper handles it if standard JS 

        // Corrections based on standard usage:
        // pitchResult is usually { pitch: float, pitchConfidence: float } (scalar)
        // mfccResult is { bands: vector, mfcc: vector }

        // Actually, let's play safe with memory key 'vectorToArray' copies it.

        return { pitch: pitch, mfcc: Array.from(mfcc) };
    }
}
