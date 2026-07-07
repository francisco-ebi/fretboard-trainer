// Harmonic-structure features derived from the pitch-guided partials that the
// inharmonicity fit already tracks (roadmap §10.1) — no additional spectral
// analysis is performed.
//
// Physics: the pluck position imposes a comb filter on the string (partial n
// scales like |sin(n·π·d)| for a pluck at fraction d of the string length),
// and string construction shapes how the upper partials sit and decay. The
// raw MFCC envelope carries all of this entangled; explicit per-partial
// ratios hand the model the structure directly. The recording protocol's
// variation grid rotates pluck position, so what remains learnable across a
// dataset is the string-dependent part.

import type { SpectralPartial } from './inharmonicity';

// Partials 2..8 measured in dB relative to partial 1
export const HARMONIC_PARTIAL_COUNT = 7;
// "Inaudible" floor: also the sentinel for partials the tracker could not
// find (buried in noise or beyond the spectrum)
export const HARMONIC_DB_FLOOR = -60;
// Real partials can exceed the fundamental near pluck-point nulls
export const HARMONIC_DB_CEIL = 12;
// Odd/even overtone energy ratio is log10-encoded and clamped to this range
export const ODD_EVEN_LOG_CLAMP = 3;

const HIGHEST_PARTIAL = HARMONIC_PARTIAL_COUNT + 1; // partials 1..8

export interface HarmonicFeatures {
    partialsDb: number[]; // length 7: partials 2..8 in dB re partial 1
    tristimulus: [number, number, number];
    oddEvenRatio: number; // log10(odd/even overtone energy), clamped
}

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

// Returns null when partial 1 was not tracked: without the dB reference the
// ratios are undefined, and a frame whose fundamental is buried is suspect
// anyway. Callers drop the frame, like any other failed extraction.
export function computeHarmonicFeatures(partials: SpectralPartial[]): HarmonicFeatures | null {
    const magnitudes = new Array<number>(HIGHEST_PARTIAL + 1).fill(0);
    for (const partial of partials) {
        if (partial.n >= 1 && partial.n <= HIGHEST_PARTIAL && partial.magnitude > 0) {
            magnitudes[partial.n] = partial.magnitude;
        }
    }

    const fundamental = magnitudes[1];
    if (fundamental <= 0) return null;

    const partialsDb: number[] = [];
    for (let n = 2; n <= HIGHEST_PARTIAL; n++) {
        if (magnitudes[n] <= 0) {
            partialsDb.push(HARMONIC_DB_FLOOR);
            continue;
        }
        const db = 20 * Math.log10(magnitudes[n] / fundamental);
        partialsDb.push(clamp(db, HARMONIC_DB_FLOOR, HARMONIC_DB_CEIL));
    }

    // Tristimulus over the tracked linear magnitudes (essentia's convention,
    // but computed from the pitch-guided partials so band membership is by
    // true partial number, not by whatever generic peak came first).
    let total = 0;
    for (let n = 1; n <= HIGHEST_PARTIAL; n++) total += magnitudes[n];
    const tristimulus: [number, number, number] = [
        magnitudes[1] / total,
        (magnitudes[2] + magnitudes[3] + magnitudes[4]) / total,
        (magnitudes[5] + magnitudes[6] + magnitudes[7] + magnitudes[8]) / total
    ];

    // Odd/even energy ratio over the *overtones* (3,5,7 vs 2,4,6) — unlike
    // essentia's OddToEvenHarmonicEnergyRatio we exclude the fundamental,
    // which would otherwise dominate "odd" and mask the comb-filter contrast.
    const oddEnergy = magnitudes[3] ** 2 + magnitudes[5] ** 2 + magnitudes[7] ** 2;
    const evenEnergy = magnitudes[2] ** 2 + magnitudes[4] ** 2 + magnitudes[6] ** 2;
    let oddEvenRatio = 0;
    if (oddEnergy > 0 && evenEnergy > 0) {
        oddEvenRatio = clamp(Math.log10(oddEnergy / evenEnergy), -ODD_EVEN_LOG_CLAMP, ODD_EVEN_LOG_CLAMP);
    } else if (oddEnergy > 0) {
        oddEvenRatio = ODD_EVEN_LOG_CLAMP;
    } else if (evenEnergy > 0) {
        oddEvenRatio = -ODD_EVEN_LOG_CLAMP;
    }

    return { partialsDb, tristimulus, oddEvenRatio };
}
