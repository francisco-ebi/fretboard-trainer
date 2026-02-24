
// AudioWorklet Global Scope Types
interface AudioWorkletProcessor {
    readonly port: MessagePort;
    process(
        inputs: Float32Array[][],
        outputs: Float32Array[][],
        parameters: Record<string, Float32Array>
    ): boolean;
}

declare var AudioWorkletProcessor: {
    prototype: AudioWorkletProcessor;
    new(options?: any): AudioWorkletProcessor;
};

declare function registerProcessor(
    name: string,
    processorCtor: (new (options?: any) => AudioWorkletProcessor)
): void;

// Meyda Types (Partial)
declare module 'meyda' {
    export interface MeydaFeatures {
        mfcc: number[];
        [key: string]: any;
    }

    export let audioContext: AudioContext | null;
    export let bufferSize: number;
    export let windowingFunction: string;

    export function extract(
        feature: string,
        buffer: Float32Array | number[]
    ): any;
}
