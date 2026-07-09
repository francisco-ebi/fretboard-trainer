/**
 * A JS FIFO implementation for audio sample accumulation. Assumptions:
 *  1. push and pull sizes may vary per call (indices wrap with modulo
 *     arithmetic), but callers must not push more than the free capacity —
 *     overflow silently overwrites the oldest samples.
 *  2. the channel count of input/output cannot be changed dynamically.
 *  3. This is for single-thread operation (use the SAB RingBuffer for
 *     cross-thread transport).
 */
export class ChromeLabsRingBuffer {
    private _readIndex: number;
    private _writeIndex: number;
    private _framesAvailable: number;
    private _channelCount: number;
    private _length: number;
    private _channelData: Float32Array[];

    /**
     * @param  {number} length Buffer length in frames.
     * @param  {number} channelCount Buffer channel count.
     */
    constructor(length: number, channelCount: number) {
        this._readIndex = 0;
        this._writeIndex = 0;
        this._framesAvailable = 0;

        this._channelCount = channelCount;
        this._length = length;
        this._channelData = [];
        for (let i = 0; i < this._channelCount; ++i) {
            this._channelData[i] = new Float32Array(length);
        }
    }

    /**
     * Getter for Available frames in buffer.
     *
     * @return {number} Available frames in buffer.
     */
    get framesAvailable(): number {
        return this._framesAvailable;
    }

    /**
     * Push a sequence of Float32Arrays to buffer.
     *
     * @param  {Float32Array[]} arraySequence A sequence of Float32Arrays.
     */
    push(arraySequence: Float32Array[]) {
        // The channel count of arraySequence and the length of each channel must
        // match with this buffer obejct.

        // Transfer data from the |arraySequence| storage to the internal buffer.
        let sourceLength = arraySequence[0].length;
        for (let i = 0; i < sourceLength; ++i) {
            let writeIndex = (this._writeIndex + i) % this._length;
            for (let channel = 0; channel < this._channelCount; ++channel) {
                this._channelData[channel][writeIndex] = arraySequence[channel][i];
            }
        }

        this._writeIndex = (this._writeIndex + sourceLength) % this._length;

        // For excessive frames, the buffer will be overwritten.
        this._framesAvailable += sourceLength;
        if (this._framesAvailable > this._length) {
            this._framesAvailable = this._length;
        }
    }

    /**
     * Pull data out of buffer and fill a given sequence of Float32Arrays.
     *
     * @param  {Float32Array[]} arraySequence An array of Float32Arrays.
     */
    pull(arraySequence: Float32Array[]) {
        // The channel count of arraySequence and the length of each channel must
        // match with this buffer obejct.

        // If the FIFO is completely empty, do nothing.
        if (this._framesAvailable === 0) {
            return;
        }

        let destinationLength = arraySequence[0].length;

        // Transfer data from the internal buffer to the |arraySequence| storage.
        for (let i = 0; i < destinationLength; ++i) {
            let readIndex = (this._readIndex + i) % this._length;
            for (let channel = 0; channel < this._channelCount; ++channel) {
                arraySequence[channel][i] = this._channelData[channel][readIndex];
            }
        }

        this._readIndex = (this._readIndex + destinationLength) % this._length;

        this._framesAvailable -= destinationLength;
        if (this._framesAvailable < 0) {
            this._framesAvailable = 0;
        }
    }
}
