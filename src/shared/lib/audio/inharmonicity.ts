// Estimation of the string-stiffness (inharmonicity) coefficient B.
//
// Partials of a real (stiff) string deviate from perfect harmonics as
//   f_n = n · f0 · sqrt(1 + B·n²)
// B depends on string gauge/construction and vibrating length, which makes it
// the most physically grounded discriminator for "same pitch, different
// string". Pure math lives here so it can be unit-tested without the WASM
// worklet environment.

export interface SpectralPartial {
    n: number; // partial number (1 = fundamental)
    freq: number; // measured frequency in Hz
    magnitude: number;
}

// Quadratic (parabolic) interpolation around a spectral peak bin.
// Interpolates log-magnitudes when possible: window main lobes (and gaussian
// peaks) are near-parabolic in the log domain, which removes most of the
// systematic offset bias of a linear-magnitude parabola.
// Returns the refined fractional bin position.
export function interpolatePeakBin(spectrum: ArrayLike<number>, bin: number): number {
    if (bin <= 0 || bin >= spectrum.length - 1) return bin;
    let alpha = spectrum[bin - 1];
    let beta = spectrum[bin];
    let gamma = spectrum[bin + 1];
    if (alpha > 0 && beta > 0 && gamma > 0) {
        alpha = Math.log(alpha);
        beta = Math.log(beta);
        gamma = Math.log(gamma);
    }
    const denom = alpha - 2 * beta + gamma;
    if (denom === 0) return bin;
    const delta = 0.5 * (alpha - gamma) / denom;
    // A well-formed peak interpolates within ±0.5 bins
    if (!Number.isFinite(delta) || Math.abs(delta) > 0.5) return bin;
    return bin + delta;
}

// Locate the first `maxPartials` partials of f0 in a magnitude spectrum by
// searching a narrow window around each expected (inharmonicity-corrected)
// position. `binHz` is sampleRate / fftFrameSize.
export function findPartials(
    spectrum: ArrayLike<number>,
    f0: number,
    binHz: number,
    maxPartials = 10
): SpectralPartial[] {
    if (f0 <= 0 || binHz <= 0) return [];

    let specMax = 0;
    for (let i = 0; i < spectrum.length; i++) {
        if (spectrum[i] > specMax) specMax = spectrum[i];
    }
    if (specMax <= 0) return [];
    const magnitudeFloor = specMax * 1e-3;

    const partials: SpectralPartial[] = [];
    let runningB = 0;

    for (let n = 1; n <= maxPartials; n++) {
        const expected = n * f0 * Math.sqrt(1 + runningB * n * n);
        const centerBin = expected / binHz;
        if (centerBin >= spectrum.length - 2) break;

        // ±4% search window (at least ±2 bins): covers B up to ~1e-3 while
        // staying well below the spacing to the next partial.
        const halfWindow = Math.max(2, Math.round(centerBin * 0.04));
        const lo = Math.max(1, Math.round(centerBin) - halfWindow);
        const hi = Math.min(spectrum.length - 2, Math.round(centerBin) + halfWindow);

        let bestBin = -1;
        let bestMag = magnitudeFloor;
        for (let k = lo; k <= hi; k++) {
            if (spectrum[k] >= spectrum[k - 1] && spectrum[k] >= spectrum[k + 1] && spectrum[k] > bestMag) {
                bestMag = spectrum[k];
                bestBin = k;
            }
        }
        if (bestBin < 0) continue; // partial buried in noise: skip, keep searching higher ones

        const refinedBin = interpolatePeakBin(spectrum, bestBin);
        partials.push({ n, freq: refinedBin * binHz, magnitude: bestMag });

        // Track B as we go so high-partial windows stay centered
        const fitted = fitInharmonicityB(partials);
        if (fitted !== null && fitted > 0) runningB = fitted;
    }

    return partials;
}

// Two-parameter least-squares fit of the inharmonic string model
//   f_n² = F²·n² + F²B·n⁴   (basis {n², n⁴}, then B = coeff2 / coeff1)
// Fitting F² jointly avoids referencing any single measured partial as f0 —
// a small error in the fundamental would otherwise propagate into every
// frequency ratio and dominate B. Returns null with fewer than 4 partials
// or a degenerate fit.
export function fitInharmonicityB(partials: SpectralPartial[]): number | null {
    if (partials.length < 4) return null;

    let s11 = 0, s12 = 0, s22 = 0, t1 = 0, t2 = 0;
    for (const partial of partials) {
        const n2 = partial.n * partial.n;
        const x1 = n2;
        const x2 = n2 * n2;
        const y = partial.freq * partial.freq;
        s11 += x1 * x1;
        s12 += x1 * x2;
        s22 += x2 * x2;
        t1 += x1 * y;
        t2 += x2 * y;
    }

    const det = s11 * s22 - s12 * s12;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;

    const fSquared = (t1 * s22 - t2 * s12) / det;
    const fSquaredTimesB = (s11 * t2 - s12 * t1) / det;
    if (!Number.isFinite(fSquared) || fSquared <= 0) return null;

    const b = fSquaredTimesB / fSquared;
    return Number.isFinite(b) ? b : null;
}

// Feature encoding: log10(B) clamped to a sane range for guitar strings
// (B ≈ 1e-5…1e-2). Fit noise can produce tiny negative B; clamp treats it
// as "no measurable stiffness".
export function encodeInharmonicityB(b: number): number {
    const clamped = Math.min(1e-2, Math.max(1e-6, b));
    return Math.log10(clamped);
}
