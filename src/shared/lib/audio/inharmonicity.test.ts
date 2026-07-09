import { describe, it, expect } from 'vitest';
import { findPartials, fitInharmonicityB, encodeInharmonicityB, interpolatePeakBin, type SpectralPartial } from './inharmonicity';

const SAMPLE_RATE = 48000;
const FRAME_SIZE = 2048;
const BIN_HZ = SAMPLE_RATE / FRAME_SIZE; // 23.4375 Hz

// Place gaussian-ish peaks at the inharmonic partial positions of (f0, B)
function syntheticSpectrum(f0: number, b: number, partialCount = 10): Float32Array {
    const spectrum = new Float32Array(FRAME_SIZE / 2 + 1);
    for (let n = 1; n <= partialCount; n++) {
        const freq = n * f0 * Math.sqrt(1 + b * n * n);
        const centerBin = freq / BIN_HZ;
        const magnitude = 1 / n; // decaying harmonic envelope
        for (let k = Math.floor(centerBin) - 3; k <= Math.ceil(centerBin) + 3; k++) {
            if (k < 0 || k >= spectrum.length) continue;
            const distance = k - centerBin;
            spectrum[k] += magnitude * Math.exp(-(distance * distance) / 0.5);
        }
    }
    return spectrum;
}

describe('fitInharmonicityB', () => {
    it('recovers B exactly from ideal partials', () => {
        const b = 5e-4;
        const f0 = 130.81; // C3
        const partials: SpectralPartial[] = [];
        for (let n = 1; n <= 8; n++) {
            partials.push({ n, freq: n * f0 * Math.sqrt(1 + b * n * n), magnitude: 1 / n });
        }
        const fitted = fitInharmonicityB(partials);
        expect(fitted).not.toBeNull();
        expect(fitted!).toBeCloseTo(b, 6);
    });

    it('returns null with fewer than 4 partials', () => {
        const f0 = 130.81;
        const partials: SpectralPartial[] = [
            { n: 1, freq: f0, magnitude: 1 },
            { n: 2, freq: 2 * f0, magnitude: 0.5 },
            { n: 3, freq: 3 * f0, magnitude: 0.3 }
        ];
        expect(fitInharmonicityB(partials)).toBeNull();
    });
});

describe('findPartials + fit on a synthetic spectrum', () => {
    it('recovers B within tolerance for a wound-string-like coefficient', () => {
        const b = 5e-4;
        const f0 = 130.81;
        const spectrum = syntheticSpectrum(f0, b);

        const partials = findPartials(spectrum, f0, BIN_HZ);
        expect(partials.length).toBeGreaterThanOrEqual(6);

        const fitted = fitInharmonicityB(partials);
        expect(fitted).not.toBeNull();
        // Bin quantization + interpolation error: accept ±30% relative error,
        // far below the several-fold B difference between strings
        expect(fitted!).toBeGreaterThan(b * 0.7);
        expect(fitted!).toBeLessThan(b * 1.3);
    });

    it('distinguishes a stiff string from a nearly ideal one', () => {
        const f0 = 130.81;
        const stiff = fitInharmonicityB(findPartials(syntheticSpectrum(f0, 1e-3), f0, BIN_HZ));
        const ideal = fitInharmonicityB(findPartials(syntheticSpectrum(f0, 5e-5), f0, BIN_HZ));
        expect(stiff).not.toBeNull();
        expect(ideal).not.toBeNull();
        expect(stiff!).toBeGreaterThan(ideal! * 3);
    });

    it('returns no partials for silence', () => {
        expect(findPartials(new Float32Array(1025), 130.81, BIN_HZ)).toEqual([]);
    });
});

describe('encodeInharmonicityB', () => {
    it('log-scales and clamps', () => {
        expect(encodeInharmonicityB(1e-4)).toBeCloseTo(-4, 5);
        expect(encodeInharmonicityB(-1)).toBeCloseTo(-6, 5); // fit noise → floor
        expect(encodeInharmonicityB(1)).toBeCloseTo(-2, 5); // absurdly stiff → ceiling
    });
});

describe('interpolatePeakBin', () => {
    it('refines a peak between bins', () => {
        const spectrum = new Float32Array(16);
        // Peak centered between bins 7 and 8, slightly closer to 7
        spectrum[6] = 0.5;
        spectrum[7] = 1.0;
        spectrum[8] = 0.9;
        const refined = interpolatePeakBin(spectrum, 7);
        expect(refined).toBeGreaterThan(7);
        expect(refined).toBeLessThan(7.5);
    });
});
