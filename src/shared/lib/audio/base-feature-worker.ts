import { AudioReader, AudioWriter, RingBuffer } from './sab-ring-buffer';
import { FeatureExtractionLoop } from './feature-extraction-loop';
import type { AudioBackend } from './worklet-types';

// Driver for the feature-extraction Worker, parameterized by backend so the
// worker entry module stays a thin shell around the backend it instantiates.
//
// The worker drains the raw-audio SAB written by audio-capture-processor on a
// short poll and feeds the (thread-agnostic) FeatureExtractionLoop, which
// writes feature frames to the feature SAB the main-thread engines read.
// Running here instead of the AudioWorklet means extraction can take as long
// as it needs without ever glitching the realtime audio thread.

const POLL_INTERVAL_MS = 10;

export interface FeatureWorkerInit {
    command: 'init';
    audioSab: SharedArrayBuffer;
    featureSab: SharedArrayBuffer;
    sampleRate: number;
    bufferSize: number;
}

export function runFeatureWorker(createBackend: () => AudioBackend) {
    let interval: ReturnType<typeof setInterval> | null = null;

    self.onmessage = (event: MessageEvent<FeatureWorkerInit>) => {
        const data = event.data;
        if (!data || data.command !== 'init') return;
        if (interval) clearInterval(interval);

        const reader = new AudioReader(new RingBuffer(data.audioSab));
        const writer = new AudioWriter(new RingBuffer(data.featureSab));

        const backend = createBackend();
        let backendReady = false;
        backend.init(data.sampleRate, data.bufferSize, data.bufferSize / 2).then(() => {
            backendReady = true;
            console.log(`[FeatureWorker] ${backend.name} backend initialized`);
        }).catch(err => {
            console.error(`[FeatureWorker] ${backend.name} backend init error:`, err);
        });

        const loop = new FeatureExtractionLoop(
            backend,
            (features) => {
                if (writer.available_write() >= features.length) {
                    writer.enqueue(features);
                    return true;
                }
                return false;
            },
            data.bufferSize,
            () => backendReady
        );

        // Drain in chunks no larger than the loop's per-push limit
        const scratch = new Float32Array(data.bufferSize);
        interval = setInterval(() => {
            let available = reader.available_read();
            while (available > 0) {
                const toRead = Math.min(available, scratch.length);
                const view = scratch.subarray(0, toRead);
                reader.dequeue(view);
                loop.pushSamples(view);
                available -= toRead;
            }
        }, POLL_INTERVAL_MS);
    };
}
