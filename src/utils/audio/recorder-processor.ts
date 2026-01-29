// src/utils/audio/recorder-processor.ts (Must match filename in engine.ts import)

class RecorderProcessor extends AudioWorkletProcessor {
    bufferSize: number;
    buffer: Float32Array;
    byteIndex: number;

    constructor() {
        super();
        this.bufferSize = 2048;
        this.buffer = new Float32Array(this.bufferSize);
        this.byteIndex = 0;
    }

    process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const input = inputs[0];
        if (!input || input.length === 0) return true;

        const channelData = input[0]; // Mono channel

        if (!channelData || channelData.length === 0) return true;

        for (let i = 0; i < channelData.length; i++) {
            this.buffer[this.byteIndex] = channelData[i];
            this.byteIndex++;

            if (this.byteIndex >= this.bufferSize) {
                // Clone and calculate RMS for Noise Gate
                const bufferToSend = new Float32Array(this.buffer);
                const rms = this.calculateRMS(bufferToSend);

                // Noise Threshold (adjustable)
                if (rms > 0.02) {
                    this.port.postMessage({
                        buffer: bufferToSend,
                        rms: rms
                    });
                }

                this.byteIndex = 0;
            }
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

registerProcessor('recorder-processor', RecorderProcessor);