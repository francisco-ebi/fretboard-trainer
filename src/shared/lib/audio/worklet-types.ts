export interface AnalysisResult {
    pitch: number | null;
    mfcc: number[] | null;
    rms?: number;
    spectralCentroid?: number | null;
    spectralFlux?: number | null;
    spectralRolloff?: number | null;
    inharmonicity?: number | null;
    pitchConfidence?: number;
    inharmonicityB?: number; // log10 of the fitted string-stiffness coefficient B
    isOnset?: boolean;
    snr?: number; // log10(rms / noise floor) from the adaptive gate — gain-invariant loudness
    harmonicsDb?: number[]; // partials 2..8 in dB re partial 1 (essentia path only)
    tristimulus?: number[]; // [t1, t2, t3] over the first 8 tracked partials
    oddEvenRatio?: number; // log10(odd/even overtone energy), clamped
}

export const FEATURE_POSITIONS = {
    PITCH: 0,
    MFCC_START: 1, // 1 to 13
    CENTROID: 14,
    ROLLOFF: 15,
    FLUX: 16,
    INHARMONICITY: 17,
    RMS: 18,
    PITCH_CONFIDENCE: 19,
    INHARMONICITY_B: 20, // log10(B) from the inharmonic partial fit
    ONSET: 21, // 1 on the first frame of a pluck, 0 otherwise
    SNR: 22, // log10(rms / noise floor), gain-invariant
    HARMONIC_DB_START: 23, // 23 to 29: partials 2..8 in dB re partial 1
    TRISTIMULUS_START: 30, // 30 to 32
    ODD_EVEN: 33, // log10(odd/even overtone energy ratio)
    TOTAL_FEATURES: 34,
};

// Bumped whenever feature *semantics* change (not just the count): a model
// trained under a different version sees differently-distributed inputs even
// if the dimensions still match. Deployed models carry the version they were
// trained with in the model manifest.
export const PIPELINE_VERSIONS = {
    // v2: real sample rate in extractors, drop-on-failure, fitted log10(B),
    //     onset anchoring, adaptive gate + SNR
    // v3: harmonic-structure features (partial dB ratios, tristimulus,
    //     odd/even overtone ratio) from the tracked partials
    essentia: 3,
    // v2: Meyda.sampleRate fix, drop-on-failure, adaptive gate frame selection
    meyda: 2,
};

export interface AudioBackend {
    name: string;
    init(sampleRate: number, bufferSize: number, hopSize: number): Promise<void>;
    // Returns a contiguous float array, or null when the frame should be dropped
    // (extraction failure or unvoiced input) instead of emitting fabricated zeros.
    process(buffer: Float32Array): Float32Array | null;
}
