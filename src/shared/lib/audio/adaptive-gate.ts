// Adaptive RMS gate with noise-floor tracking.
//
// Replaces the fixed `rms > 0.02` threshold: the gate estimates the ambient
// noise floor while closed and opens at a multiple of it, making the frame
// selection approximately gain-invariant across interfaces and rooms.
// Pure state-machine logic so it can be unit-tested outside the worklet.

export interface GateDecision {
    open: boolean;
    // True on the first frame of a pluck: the gate just opened, or the energy
    // jumped sharply while a note was already ringing (re-pluck).
    isOnset: boolean;
    // log10(rms / noiseFloor), clamped to [0, 4]. Gain-invariant loudness:
    // the same pluck on a hot or quiet interface yields a similar value.
    snr: number;
    floor: number;
}

const DEFAULTS = {
    // Gate never opens below this absolute RMS, even in a dead-silent input
    // (floor would otherwise converge to ~0 and open on anything).
    absMinGate: 0.003,
    // Hysteresis: open above floor×openFactor, close below floor×closeFactor.
    openFactor: 4,
    closeFactor: 2.5,
    // EMA rate for the floor while the gate is closed (~5-frame time constant,
    // ≈120ms at the 23ms hop).
    floorAlpha: 0.2,
    // floor×openFactor = 0.02 initially — identical to the old fixed gate
    // until the estimator converges to the actual room.
    initialFloor: 0.005,
    // RMS jump treated as a re-pluck while the gate is open.
    onsetJumpFactor: 2,
};

export class AdaptiveRmsGate {
    private floor: number;
    private open = false;
    private prevRms = 0;
    private readonly config: typeof DEFAULTS;

    constructor(config: Partial<typeof DEFAULTS> = {}) {
        this.config = { ...DEFAULTS, ...config };
        this.floor = this.config.initialFloor;
    }

    update(rms: number): GateDecision {
        const { absMinGate, openFactor, closeFactor, floorAlpha, onsetJumpFactor } = this.config;
        const openThreshold = Math.max(this.floor * openFactor, absMinGate);
        const closeThreshold = Math.max(this.floor * closeFactor, absMinGate * 0.7);

        const wasOpen = this.open;
        if (this.open) {
            if (rms < closeThreshold) this.open = false;
        } else if (rms > openThreshold) {
            this.open = true;
        }

        const isOnset = this.open && (!wasOpen || rms > this.prevRms * onsetJumpFactor);

        // Track the noise floor only while the gate is closed (presumed
        // silence). A ringing note must not inflate the floor and eat its own
        // decay tail, so the estimate is frozen while open.
        if (!this.open) {
            this.floor += floorAlpha * (rms - this.floor);
            const minFloor = absMinGate / openFactor;
            if (this.floor < minFloor) this.floor = minFloor;
        }

        this.prevRms = rms;

        const snr = Math.min(4, Math.max(0, Math.log10(Math.max(rms, 1e-9) / this.floor)));
        return { open: this.open, isOnset, snr, floor: this.floor };
    }
}
