import { describe, it, expect } from 'vitest';
import { AdaptiveRmsGate } from './adaptive-gate';

// Simulated per-frame RMS traces (~23ms per frame)
const SILENCE = 0.001;

function run(gate: AdaptiveRmsGate, trace: number[]) {
    return trace.map(rms => gate.update(rms));
}

describe('AdaptiveRmsGate', () => {
    it('stays closed on silence and opens on a pluck with an onset', () => {
        const gate = new AdaptiveRmsGate();
        const silence = run(gate, Array(30).fill(SILENCE));
        expect(silence.every(d => !d.open)).toBe(true);

        const pluck = gate.update(0.2);
        expect(pluck.open).toBe(true);
        expect(pluck.isOnset).toBe(true);

        // Sustained frames are open but not onsets
        const sustain = gate.update(0.18);
        expect(sustain.open).toBe(true);
        expect(sustain.isOnset).toBe(false);
    });

    it('applies hysteresis: no flutter between the two thresholds', () => {
        const gate = new AdaptiveRmsGate();
        run(gate, Array(30).fill(SILENCE)); // converge floor ≈ 0.001
        gate.update(0.2); // open

        // Decay into the band between close (≈0.0025) and open (≈0.004) thresholds
        const inBand = run(gate, Array(10).fill(0.003));
        expect(inBand.every(d => d.open)).toBe(true); // stays open, no flutter

        // Below the close threshold → closes and stays closed at that level
        const closed = run(gate, Array(5).fill(0.002));
        expect(closed[0].open).toBe(false);
        expect(closed.every(d => !d.open)).toBe(true);
    });

    it('flags a re-pluck (2x energy jump) while already open', () => {
        const gate = new AdaptiveRmsGate();
        run(gate, Array(30).fill(SILENCE));
        gate.update(0.1); // pluck 1 (onset)
        run(gate, [0.09, 0.08, 0.07]); // decay, no onsets
        const rePluck = gate.update(0.2); // re-pluck while ringing
        expect(rePluck.open).toBe(true);
        expect(rePluck.isOnset).toBe(true);
    });

    it('freezes the floor while a note rings (long notes keep their decay tail)', () => {
        const gate = new AdaptiveRmsGate();
        const floorBefore = run(gate, Array(30).fill(SILENCE)).at(-1)!.floor;

        // 200 loud frames (~4.6s sustained note)
        const during = run(gate, Array(200).fill(0.15));
        expect(during.at(-1)!.floor).toBeCloseTo(floorBefore, 10);
        expect(during.every(d => d.open)).toBe(true);
    });

    it('is gain-invariant once the floor has converged', () => {
        const trace = [
            ...Array(40).fill(SILENCE),
            0.08, 0.07, 0.06, 0.05, 0.04, 0.03, // pluck + decay
            ...Array(10).fill(SILENCE),
            0.1, 0.09, // re-pluck
        ];
        const gain = 8;
        const decisionsA = run(new AdaptiveRmsGate(), trace).map(d => `${d.open}|${d.isOnset}`);
        const decisionsB = run(new AdaptiveRmsGate(), trace.map(v => v * gain)).map(d => `${d.open}|${d.isOnset}`);
        // Skip the convergence window (both start from the same initial floor)
        expect(decisionsA.slice(20)).toEqual(decisionsB.slice(20));
    });

    it('snr is gain-invariant and positive while open', () => {
        const makeSnr = (gain: number) => {
            const gate = new AdaptiveRmsGate();
            run(gate, Array(40).fill(SILENCE * gain));
            return gate.update(0.1 * gain).snr;
        };
        const snr1 = makeSnr(1);
        const snr8 = makeSnr(8);
        expect(snr1).toBeGreaterThan(0);
        expect(snr8).toBeCloseTo(snr1, 3);
    });

    it('never opens on digital silence (absolute minimum bound)', () => {
        const gate = new AdaptiveRmsGate();
        run(gate, Array(50).fill(1e-6)); // floor clamps at absMinGate/openFactor
        // tiny blip above the (collapsed) floor but under absMinGate
        const blip = gate.update(0.002);
        expect(blip.open).toBe(false);
    });

    it('matches the legacy 0.02 threshold on the very first frame', () => {
        // initialFloor 0.005 × openFactor 4 = 0.02. Fresh gate per assertion:
        // a sub-threshold first frame is "silence" and immediately adapts the floor.
        expect(new AdaptiveRmsGate().update(0.019).open).toBe(false);
        expect(new AdaptiveRmsGate().update(0.021).open).toBe(true);
    });
});
