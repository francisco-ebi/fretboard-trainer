import { ChromeLabsRingBuffer } from './ring-buffer';
import { AdaptiveRmsGate } from './adaptive-gate';
import { FEATURE_POSITIONS, type AudioBackend } from './worklet-types';

// The analysis pipeline that used to run inside the AudioWorklet, now pure and
// thread-agnostic: accumulate raw samples, form 50%-overlap windows, gate,
// extract features, hand frames to a sink. base-feature-worker.ts drives it
// from a Worker; tests drive it directly.
//
// The sink returns whether the frame was actually delivered — the pending
// onset flag is only cleared on delivery, so attack frames dropped by the
// backend (or a full transport buffer) pass their onset to the next frame.
export type FeatureSink = (features: Float32Array) => boolean;

export class FeatureExtractionLoop {
    private readonly backend: AudioBackend;
    private readonly sink: FeatureSink;
    private readonly isBackendReady: () => boolean;
    private readonly bufferSize: number;
    private readonly hopSize: number;
    private readonly accum: ChromeLabsRingBuffer;
    private readonly window: Float32Array[];
    private readonly gate = new AdaptiveRmsGate();
    private pendingOnset = false;

    constructor(
        backend: AudioBackend,
        sink: FeatureSink,
        bufferSize = 2048,
        isBackendReady: () => boolean = () => true
    ) {
        this.backend = backend;
        this.sink = sink;
        this.isBackendReady = isBackendReady;
        this.bufferSize = bufferSize;
        this.hopSize = bufferSize / 2;
        // 2× capacity: after a window is analyzed, hopSize samples of overlap
        // remain; callers may push up to bufferSize more before the next
        // analysis without overflowing.
        this.accum = new ChromeLabsRingBuffer(bufferSize * 2, 1);
        this.window = [new Float32Array(bufferSize)];
    }

    // Callers must push at most `bufferSize` samples per call.
    pushSamples(chunk: Float32Array) {
        this.accum.push([chunk]);
        while (this.accum.framesAvailable >= this.bufferSize) {
            this.analyzeWindow();
        }
    }

    private analyzeWindow() {
        this.accum.pull(this.window);
        const samples = this.window[0];

        const rms = this.calculateRMS(samples);
        const gate = this.gate.update(rms);
        if (gate.isOnset) {
            this.pendingOnset = true;
        }

        if (gate.open && this.isBackendReady()) {
            const featureArray = this.backend.process(samples);
            if (featureArray) {
                featureArray[FEATURE_POSITIONS.RMS] = rms;
                featureArray[FEATURE_POSITIONS.SNR] = gate.snr;
                featureArray[FEATURE_POSITIONS.ONSET] = this.pendingOnset ? 1 : 0;
                if (this.sink(featureArray)) {
                    this.pendingOnset = false;
                }
            }
        }

        // Re-push the second half of the window for 50% overlap
        const overlap = new Float32Array(
            samples.buffer,
            this.hopSize * Float32Array.BYTES_PER_ELEMENT,
            this.bufferSize - this.hopSize
        );
        this.accum.push([overlap]);
    }

    private calculateRMS(data: Float32Array): number {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i] * data[i];
        }
        return Math.sqrt(sum / data.length);
    }
}
