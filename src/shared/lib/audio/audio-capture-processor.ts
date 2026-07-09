import { AudioWriter, RingBuffer } from './sab-ring-buffer';

// Realtime-safe capture worklet. Its ONLY job is to copy input quanta into a
// SharedArrayBuffer ring read by the feature-extraction Worker — no analysis
// runs on the audio thread (budget ≈2.7ms per 128-sample quantum). All DSP
// (windowing, gate, feature extraction) lives in base-feature-worker.ts.
class AudioCaptureProcessor extends AudioWorkletProcessor {
    private _writer: AudioWriter | null = null;

    constructor(_options: AudioWorkletNodeOptions) {
        super();
        this.port.onmessage = (event) => {
            if (event.data.command === 'sab') {
                this._writer = new AudioWriter(new RingBuffer(event.data.sab));
            }
        };
    }

    process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
        const channel = inputs[0]?.[0];
        if (channel && channel.length > 0 && this._writer) {
            // If the worker stalls and the ring fills, drop the quantum rather
            // than doing anything expensive on the audio thread.
            if (this._writer.available_write() >= channel.length) {
                this._writer.enqueue(channel);
            }
        }
        return true;
    }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
