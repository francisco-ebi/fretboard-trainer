import { describe, it, expect } from 'vitest';
import {
    computeHarmonicFeatures,
    HARMONIC_PARTIAL_COUNT,
    HARMONIC_DB_FLOOR,
    HARMONIC_DB_CEIL,
    ODD_EVEN_LOG_CLAMP
} from './harmonic-features';
import type { SpectralPartial } from './inharmonicity';

// Partials of an ideal plucked string with 1/n magnitude rolloff
const sawtoothPartials = (upTo = 8): SpectralPartial[] =>
    Array.from({ length: upTo }, (_, i) => ({
        n: i + 1,
        freq: 110 * (i + 1),
        magnitude: 1 / (i + 1)
    }));

describe('computeHarmonicFeatures', () => {
    it('computes dB ratios, tristimulus and odd/even for a 1/n sawtooth spectrum', () => {
        const result = computeHarmonicFeatures(sawtoothPartials());
        expect(result).not.toBeNull();
        const { partialsDb, tristimulus, oddEvenRatio } = result!;

        expect(partialsDb).toHaveLength(HARMONIC_PARTIAL_COUNT);
        expect(partialsDb[0]).toBeCloseTo(-6.02, 2);  // partial 2: 20·log10(1/2)
        expect(partialsDb[1]).toBeCloseTo(-9.54, 2);  // partial 3
        expect(partialsDb[6]).toBeCloseTo(-18.06, 2); // partial 8

        expect(tristimulus[0]).toBeCloseTo(0.3679, 3);
        expect(tristimulus[1]).toBeCloseTo(0.3986, 3);
        expect(tristimulus[2]).toBeCloseTo(0.2335, 3);
        expect(tristimulus[0] + tristimulus[1] + tristimulus[2]).toBeCloseTo(1, 6);

        // odd (3,5,7) vs even (2,4,6) overtone energy of the 1/n spectrum
        expect(oddEvenRatio).toBeCloseTo(-0.2975, 3);
    });

    it('marks nulled even partials with the floor sentinel and saturates odd/even (mid-string pluck)', () => {
        const oddOnly = sawtoothPartials().filter(p => p.n % 2 === 1);
        const result = computeHarmonicFeatures(oddOnly)!;

        expect(result.partialsDb[0]).toBe(HARMONIC_DB_FLOOR); // partial 2
        expect(result.partialsDb[2]).toBe(HARMONIC_DB_FLOOR); // partial 4
        expect(result.partialsDb[1]).toBeCloseTo(-9.54, 2);   // partial 3 still measured
        expect(result.oddEvenRatio).toBe(ODD_EVEN_LOG_CLAMP);
    });

    it('uses the floor sentinel for partials the tracker never found', () => {
        const result = computeHarmonicFeatures(sawtoothPartials(4))!; // minimum for the B fit
        expect(result.partialsDb.slice(3)).toEqual(new Array(4).fill(HARMONIC_DB_FLOOR)); // partials 5-8
        expect(result.partialsDb[0]).toBeCloseTo(-6.02, 2);
    });

    it('returns null without a tracked fundamental (no dB reference)', () => {
        const noFundamental = sawtoothPartials().filter(p => p.n !== 1);
        expect(computeHarmonicFeatures(noFundamental)).toBeNull();
        expect(computeHarmonicFeatures([])).toBeNull();
    });

    it('clamps ratios louder than the fundamental to the ceiling', () => {
        const partials: SpectralPartial[] = [
            { n: 1, freq: 110, magnitude: 0.01 },
            { n: 2, freq: 220, magnitude: 1 } // +40 dB re partial 1
        ];
        const result = computeHarmonicFeatures(partials)!;
        expect(result.partialsDb[0]).toBe(HARMONIC_DB_CEIL);
    });

    it('treats non-positive magnitudes as missing', () => {
        const partials = sawtoothPartials();
        partials[1] = { ...partials[1], magnitude: 0 };
        const result = computeHarmonicFeatures(partials)!;
        expect(result.partialsDb[0]).toBe(HARMONIC_DB_FLOOR);
    });

    it('ignores partials above the 8th', () => {
        const withHigh = [...sawtoothPartials(), { n: 9, freq: 990, magnitude: 5 }, { n: 10, freq: 1100, magnitude: 5 }];
        expect(computeHarmonicFeatures(withHigh)).toEqual(computeHarmonicFeatures(sawtoothPartials()));
    });

    it('saturates negatively when only even overtones exist', () => {
        const evenOnly: SpectralPartial[] = [
            { n: 1, freq: 110, magnitude: 1 },
            { n: 2, freq: 220, magnitude: 0.5 },
            { n: 4, freq: 440, magnitude: 0.25 }
        ];
        expect(computeHarmonicFeatures(evenOnly)!.oddEvenRatio).toBe(-ODD_EVEN_LOG_CLAMP);
    });
});
