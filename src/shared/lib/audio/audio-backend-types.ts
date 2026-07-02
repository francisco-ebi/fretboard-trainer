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
    pitchConfidence?: number;
    inharmonicityB?: number; // log10 of the fitted string-stiffness coefficient B
    isOnset?: boolean;
    snr?: number; // log10(rms / noise floor) from the adaptive gate — gain-invariant loudness
}
