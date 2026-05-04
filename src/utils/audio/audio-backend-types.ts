export interface AnalysisResult {
    pitch: number | null;
    mfcc: number[] | null;
    rms?: number; // Optional, useful for silence detection
    spectralCentroid?: number | null;
    spectralFlux?: number | null;
    spectralRolloff?: number | null;
    inharmonicity?: number | null;
    spectralSkewness?: number | null;
    perceptualSpread?: number | null;
    perceptualSharpness?: number | null;
}
