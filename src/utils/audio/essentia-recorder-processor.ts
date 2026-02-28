import { EssentiaBackend } from './essentia-worklet-backend';

declare const sampleRate: number;

class EssentiaRecorderProcessor extends AudioWorkletProcessor {
    bufferSize: number;
    hopSize: number;
    buffer: Float32Array;
    currentSize: number;
    backend: EssentiaBackend;
    stringIndex: number = 0;
    isBackendReady: boolean = false;

    constructor() {
        super();
        this.bufferSize = 2048;
        this.hopSize = 1024;
        this.buffer = new Float32Array(this.bufferSize);
        this.currentSize = 0;

        this.backend = new EssentiaBackend();
        this.backend.init(sampleRate).then(() => {
            this.isBackendReady = true;
            console.log(`[AudioWorklet] Essentia backend initialized`);
        }).catch(err => {
            console.error(`[AudioWorklet] Essentia backend init error:`, err);
        });

        this.port.onmessage = (event) => {
            if (event.data.command === 'setString') {
                this.stringIndex = event.data.stringIndex;
            }
        };
    }

    process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const input = inputs[0];
        if (!input || input.length === 0) return true;

        const channelData = input[0];
        if (!channelData || channelData.length === 0) return true;

        for (let i = 0; i < channelData.length; i++) {
            if (this.currentSize >= this.bufferSize) {
                this.shiftBuffer();
            }

            this.buffer[this.currentSize] = channelData[i];
            this.currentSize++;

            if (this.currentSize >= this.bufferSize) {
                const bufferToSend = new Float32Array(this.buffer);
                const rms = this.calculateRMS(bufferToSend);

                if (rms > 0.02 && this.isBackendReady) {
                    try {
                        const result = this.backend.process(bufferToSend);
                        result.rms = rms;
                        this.port.postMessage(result);
                    } catch (err) {
                        console.error("[AudioWorklet] Process error:", err);
                    }
                }

                this.shiftBuffer();
            }
        }

        return true;
    }

    shiftBuffer() {
        const overlapSize = this.bufferSize - this.hopSize;
        this.buffer.copyWithin(0, this.hopSize);
        this.currentSize = overlapSize;
    }

    calculateRMS(data: Float32Array): number {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i] * data[i];
        }
        return Math.sqrt(sum / data.length);
    }
}

registerProcessor('essentia-recorder-processor', EssentiaRecorderProcessor);
