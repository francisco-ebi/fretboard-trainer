class RecorderProcessor extends AudioWorkletProcessor {
    bufferSize: number;
    hopSize: number;
    buffer: Float32Array;
    currentSize: number;

    constructor() {
        super();
        this.bufferSize = 2048; // Frame size
        this.hopSize = 1024;    // 50% overlap
        this.buffer = new Float32Array(this.bufferSize);
        this.currentSize = 0;
    }

    process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const input = inputs[0];
        if (!input || input.length === 0) return true;

        const channelData = input[0]; // Mono channel
        if (!channelData || channelData.length === 0) return true;

        // Efficiently copy input data to buffer
        // Note: AudioWorklet input blocks are typically 128 samples
        for (let i = 0; i < channelData.length; i++) {
            // If buffer is full (shouldn't happen directly if logic is correct, but safe guard)
            if (this.currentSize >= this.bufferSize) {
                this.shiftBuffer();
            }

            this.buffer[this.currentSize] = channelData[i];
            this.currentSize++;

            if (this.currentSize >= this.bufferSize) {
                // Clone and process
                const bufferToSend = new Float32Array(this.buffer);
                const rms = this.calculateRMS(bufferToSend);

                // Noise Threshold
                if (rms > 0.02) {
                    this.port.postMessage({
                        buffer: bufferToSend,
                        rms: rms
                    }, [bufferToSend.buffer]); // Transfer buffer ownership for performance
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

registerProcessor('recorder-processor', RecorderProcessor);