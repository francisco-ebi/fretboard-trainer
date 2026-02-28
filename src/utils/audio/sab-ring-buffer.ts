export class RingBuffer {
    private _elements: Float32Array;
    private _readIndex: Int32Array;
    private _writeIndex: Int32Array;

    constructor(sab: SharedArrayBuffer) {
        this._elements = new Float32Array(sab, 8); // Offset by 8 bytes (2 int32s) for indices
        this._readIndex = new Int32Array(sab, 0, 1);
        this._writeIndex = new Int32Array(sab, 4, 1);
    }

    get capacity() {
        return this._elements.length;
    }

    get available_read() {
        const readIndex = Atomics.load(this._readIndex, 0);
        const writeIndex = Atomics.load(this._writeIndex, 0);
        if (writeIndex >= readIndex) {
            return writeIndex - readIndex;
        }
        return writeIndex + this.capacity - readIndex;
    }

    get available_write() {
        return this.capacity - this.available_read - 1; // 1 slot empty to distinguish full vs empty
    }

    push(elements: Float32Array) {
        const writeIndex = Atomics.load(this._writeIndex, 0);
        let nextWriteIndex = writeIndex;

        for (let i = 0; i < elements.length; i++) {
            this._elements[nextWriteIndex] = elements[i];
            nextWriteIndex = (nextWriteIndex + 1) % this.capacity;
        }

        Atomics.store(this._writeIndex, 0, nextWriteIndex);
        return elements.length;
    }

    pull(elements: Float32Array) {
        const readIndex = Atomics.load(this._readIndex, 0);
        const available = this.available_read;
        const toRead = Math.min(elements.length, available);

        let nextReadIndex = readIndex;
        for (let i = 0; i < toRead; i++) {
            elements[i] = this._elements[nextReadIndex];
            nextReadIndex = (nextReadIndex + 1) % this.capacity;
        }

        Atomics.store(this._readIndex, 0, nextReadIndex);
        return toRead;
    }
}

export class AudioWriter {
    ringBuffer: RingBuffer;

    constructor(ringBuffer: RingBuffer) {
        this.ringBuffer = ringBuffer;
    }

    enqueue(elements: Float32Array) {
        return this.ringBuffer.push(elements);
    }

    available_write() {
        return this.ringBuffer.available_write;
    }
}

export class AudioReader {
    ringBuffer: RingBuffer;

    constructor(ringBuffer: RingBuffer) {
        this.ringBuffer = ringBuffer;
    }

    dequeue(elements: Float32Array) {
        return this.ringBuffer.pull(elements);
    }

    available_read() {
        return this.ringBuffer.available_read;
    }
}
