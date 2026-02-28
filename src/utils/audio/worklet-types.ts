export interface AnalysisResult {
    pitch: number | null;
    mfcc: number[] | null;
    rms?: number;
    spectralCentroid?: number | null;
    spectralFlux?: number | null;
    spectralRolloff?: number | null;
    inharmonicity?: number | null;
}

export interface AudioBackend {
    name: string;
    init(sampleRate: number): Promise<void>;
    process(buffer: Float32Array): AnalysisResult;
}
