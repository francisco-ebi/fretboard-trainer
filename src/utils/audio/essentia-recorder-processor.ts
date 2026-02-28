import { EssentiaBackend } from './essentia-worklet-backend';
import { ChromeLabsRingBuffer } from './ring-buffer';

declare const sampleRate: number;

class EssentiaRecorderProcessor extends AudioWorkletProcessor {
    bufferSize: number;
    hopSize: number;
    backend: EssentiaBackend;
    stringIndex: number = 0;
    isBackendReady: boolean = false;
    private _inputRingBuffer: ChromeLabsRingBuffer;
    private _accumData: Float32Array[];

    constructor() {
        super();
        this.bufferSize = 2048;
        this.hopSize = 1024;
        this._inputRingBuffer = new ChromeLabsRingBuffer(this.bufferSize, 1);
        this._accumData = [new Float32Array(this.bufferSize)];

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

        // Push modern 128-sample chunk into the ring buffer
        this._inputRingBuffer.push([channelData]);

        // Check if we have enough frames for analysis (e.g., 2048)
        if (this._inputRingBuffer.framesAvailable >= this.bufferSize) {
            // Pull enough frames to cover hopSize/bufferSize overlap
            this._inputRingBuffer.pull(this._accumData);

            let rms = this.calculateRMS(this._accumData[0]);
            if (rms > 0.02 && this.isBackendReady) {
                const result = this.backend.process(this._accumData[0]);
                result.rms = rms;
                this.port.postMessage(result);
            }

            // Re-push overlap data (bufferSize - hopSize) back into the ring buffer
            // to support sliding windows correctly.
            const overlapSize = this.bufferSize - this.hopSize;
            const overlapData = new Float32Array(this._accumData[0].buffer, this.hopSize * Float32Array.BYTES_PER_ELEMENT, overlapSize);
            this._inputRingBuffer.push([overlapData]);
        }
        return true;
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
