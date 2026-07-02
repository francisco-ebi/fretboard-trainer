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
    TOTAL_FEATURES: 22,
};

export interface AudioBackend {
    name: string;
    init(sampleRate: number, bufferSize: number, hopSize: number): Promise<void>;
    // Returns a contiguous float array, or null when the frame should be dropped
    // (extraction failure or unvoiced input) instead of emitting fabricated zeros.
    process(buffer: Float32Array): Float32Array | null;
}
