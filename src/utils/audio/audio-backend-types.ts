export interface AnalysisResult {
    pitch: number | null;
    mfcc: number[] | null;
    rms?: number; // Optional, useful for silence detection
    spectralCentroid?: number | null;
    spectralFlux?: number | null;
    spectralRolloff?: number | null;
    inharmonicity?: number | null;
}

export interface AudioAnalysisBackend {
    name: string;
    init(context: AudioContext): Promise<void>;
    process(buffer: Float32Array): Promise<AnalysisResult>;
    destroy?(): void;
}
