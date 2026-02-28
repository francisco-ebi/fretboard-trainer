export interface AnalysisResult {
    pitch: number | null;
    mfcc: number[] | null;
    rms?: number;
    spectralCentroid?: number | null;
    spectralFlux?: number | null;
    spectralRolloff?: number | null;
    inharmonicity?: number | null;
}

export const FEATURE_POSITIONS = {
    PITCH: 0,
    MFCC_START: 1, // 1 to 13
    CENTROID: 14,
    ROLLOFF: 15,
    FLUX: 16,
    INHARMONICITY: 17,
    RMS: 18,
    TOTAL_FEATURES: 21,
};

export interface AudioBackend {
    name: string;
    init(sampleRate: number): Promise<void>;
    process(buffer: Float32Array): Float32Array; // Now returns a contiguous float array
}
