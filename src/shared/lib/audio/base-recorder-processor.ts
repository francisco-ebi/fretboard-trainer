import { ChromeLabsRingBuffer } from './ring-buffer';
import { AudioWriter, RingBuffer } from './sab-ring-buffer';
import { AdaptiveRmsGate } from './adaptive-gate';
import { FEATURE_POSITIONS, type AudioBackend } from './worklet-types';

// Shared implementation of the recorder AudioWorkletProcessor.
//
// The essentia and meyda worklet entry modules differ only in which backend
// they instantiate and the processor name they register — everything else
// (window accumulation, adaptive gate, onset carryover, SAB transport) lives
// here exactly once. Keep the entry modules separate: each ?url worklet
// bundle then only carries its own backend (the essentia WASM must not be
// pulled into the meyda worklet and vice versa).
export function registerRecorderProcessor(name: string, createBackend: () => AudioBackend) {
    class RecorderProcessor extends AudioWorkletProcessor {
        bufferSize: number;
        hopSize: number;
        backend: AudioBackend;
        stringIndex: number = 0;
        isBackendReady: boolean = false;
        private _inputRingBuffer: ChromeLabsRingBuffer;
        private _accumData: Float32Array[];
        private _audioWriter: AudioWriter | null = null;
        private _gate = new AdaptiveRmsGate();
        private _pendingOnset: boolean = false;

        constructor(options: AudioWorkletNodeOptions) {
            super();
            this.bufferSize = options.processorOptions.bufferSize;
            this.hopSize = options.processorOptions.bufferSize / 2;
            this._inputRingBuffer = new ChromeLabsRingBuffer(this.bufferSize, 1);
            this._accumData = [new Float32Array(this.bufferSize)];

            this.backend = createBackend();
            this.backend.init(options.processorOptions.sampleRate, this.bufferSize, this.hopSize).then(() => {
                this.isBackendReady = true;
                console.log(`[AudioWorklet] ${this.backend.name} backend initialized`);
            }).catch(err => {
                console.error(`[AudioWorklet] ${this.backend.name} backend init error:`, err);
            });

            this.port.onmessage = (event) => {
                if (event.data.command === 'setString') {
                    this.stringIndex = event.data.stringIndex;
                } else if (event.data.command === 'sab') {
                    this._audioWriter = new AudioWriter(new RingBuffer(event.data.sab));
                    console.log("[AudioWorklet] AudioWriter initialized from SAB.");
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
                // Adaptive gate: opens at a multiple of the tracked noise floor
                // (gain-invariant), with onset = gate opening or a sharp energy
                // jump. The onset is kept pending until a frame actually ships,
                // so backend-dropped attack frames don't lose it.
                const gate = this._gate.update(rms);
                if (gate.isOnset) {
                    this._pendingOnset = true;
                }
                if (gate.open && this.isBackendReady) {
                    const featureArray = this.backend.process(this._accumData[0]);
                    if (featureArray) {
                        featureArray[FEATURE_POSITIONS.RMS] = rms;
                        featureArray[FEATURE_POSITIONS.SNR] = gate.snr;
                        featureArray[FEATURE_POSITIONS.ONSET] = this._pendingOnset ? 1 : 0;
                        // Push directly to SAB if available
                        if (this._audioWriter && this._audioWriter.available_write() >= featureArray.length) {
                            this._audioWriter.enqueue(featureArray);
                            this._pendingOnset = false;
                        }
                    }
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

    registerProcessor(name, RecorderProcessor);
}
