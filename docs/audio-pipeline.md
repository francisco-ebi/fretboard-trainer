# Audio Pipeline & String-Classification Model

This document explains how Fretboard Trainer listens to a guitar and predicts **which string a note was played on**. It covers the full signal path, every feature fed to the neural network, the training and inference flows, known limitations, and the improvement roadmap.

Audience: a developer new to the project. No DSP background is assumed for the overview sections; the feature sections include the underlying physics where it matters.

---

## 1. The problem

Detecting *which note* was played is easy — a pitch detector gives you the fundamental frequency (f0). The hard problem is that **the same pitch exists in several places on the fretboard**: C3 (~130.8 Hz) can be played on string 6 fret 8 or string 5 fret 3. Same f0, same guitar body, same room.

What actually differs between those two C3s is the **string itself**:

| Physical cause | Audible consequence |
|---|---|
| String gauge, winding, stiffness | Partials deviate from perfect harmonics (**inharmonicity**) |
| Vibrating length (higher fret on a thicker string) | Different decay rate and brightness envelope |
| Pluck transient interacting with the string | Different attack spectrum |

The neural network's job is to read those differences from short feature sequences and output one of 6 string classes. The detected pitch then gives the fret for free: `fret = midi − openStringMidi`.

---

## 2. System overview

```
 microphone
     │  getUserMedia (mono, AGC/echo/noise-suppression OFF)
     ▼
 AudioWorklet thread (realtime)
 ┌───────────────────────────────────────────────────────────┐
 │ {essentia|meyda}-recorder-processor.ts                    │
 │   128-sample quanta → ChromeLabs ring buffer              │
 │   → 2048-sample window, 1024 hop (50% overlap, ~23ms)     │
 │   → adaptive RMS gate (noise-floor tracking) + onsets     │
 │   → backend.process(window)  ── null → frame dropped      │
 │       EssentiaBackend / MeydaBackend (feature extraction) │
 │   → Float32Array[23] into SharedArrayBuffer ring buffer   │
 └───────────────────────────────────────────────────────────┘
     │  SAB (lock-free, cross-thread; needs cross-origin isolation)
     ▼
 Main thread (16ms polling)
 ┌───────────────────────────────────────────────────────────┐
 │ recording-engine.ts        prediction-engine.ts           │
 │   label + save sequences     build sequences → normalize  │
 │   → dataset JSON download    → TF.js model → feasibility  │
 │                                mask → RxJS stabilization  │
 └───────────────────────────────────────────────────────────┘
     │                              │
     ▼                              ▼
 model.ts (training, TF.js)     Fretboard UI (PredictionOverlay)
```

Key files:

| File | Role |
|---|---|
| `src/shared/lib/audio/base-recorder-processor.ts` | The worklet processor logic (windowing, adaptive gate, onset, SAB write), parameterized by backend |
| `src/shared/lib/audio/essentia-recorder-processor.ts` | Thin worklet entry: registers the base processor with `EssentiaBackend` |
| `src/shared/lib/audio/meyda-recorder-processor.ts` | Thin worklet entry: registers the base processor with `MeydaBackend` |
| `src/shared/lib/audio/essentia-worklet-backend.ts` | Feature extraction with essentia.js (WASM) |
| `src/shared/lib/audio/meyda-worklet-backend.ts` | Feature extraction with Meyda + pitchfinder |
| `src/shared/lib/audio/inharmonicity.ts` | Pure math: partial tracking + stiffness-coefficient fit (unit-tested) |
| `src/shared/lib/audio/adaptive-gate.ts` | Pure state machine: noise-floor-tracking RMS gate + onset + SNR (unit-tested) |
| `src/shared/lib/audio/worklet-types.ts` | The SAB frame layout (`FEATURE_POSITIONS`) — single source of truth |
| `src/shared/lib/audio/sab-ring-buffer.ts` | Lock-free SharedArrayBuffer ring buffer (worklet → main thread) |
| `src/shared/lib/audio/ring-buffer.ts` | In-worklet FIFO for building 2048 windows from 128-sample quanta |
| `src/shared/lib/audio/recording-engine.ts` | Dataset capture: labeling, sequence building, download |
| `src/shared/lib/audio/prediction-engine.ts` | Live inference: sequences, normalization, masking, stabilization |
| `src/shared/lib/audio/dataset-preparation.ts` | Stats, normalization, stratified train/val split |
| `src/shared/lib/audio/model.ts` | Model definition + training loop |
| `src/shared/lib/audio/dataset-loader.ts` | Fetches datasets from `public/datasets/` (kept out of the JS bundle) |
| `src/shared/lib/audio/model-manifest.ts` | Manifest schema + pure validation (model↔stats↔pipeline pairing, unit-tested) |
| `public/model/manifest.json` | Deployment manifest: per-mode model pointer + embedded normalization stats |

### Two backends, two modes

| | `essentia` ("precision" mode) | `meyda` ("performance" mode) |
|---|---|---|
| Pitch | essentia `PitchYinFFT` (+ confidence) | pitchfinder Macleod (probability-gated) or YIN |
| Features | Full set incl. inharmonicity + fitted B | MFCC + centroid + rolloff + brightness only |
| Cost | Heavier (WASM FFTs ×2, peaks, partial fit) | Lighter (pure JS) |
| Model input | 21 features/frame | 17 features/frame |
| Deployed model | `public/model/guitar-essentia-ts.json` (**stale — retrain needed**, see §8) | `public/model/guitar-meyda-ts-brightness-model.json` |

The mode is chosen in the prediction engine (`setMode`), which swaps both the worklet processor and the model+stats pair.

---

## 3. From microphone to feature frame

1. **Capture constraints** (`recording-engine.init` / `prediction-engine.init`): mono, `echoCancellation/autoGainControl/noiseSuppression` all disabled — browser DSP would distort the very timbre features we need.
2. **Windowing**: Web Audio delivers 128-sample quanta. The processor accumulates them in a FIFO and analyzes **2048-sample windows with a 1024 hop** (50% overlap). At 44.1 kHz that's a ~46 ms window every ~23 ms.
3. **Adaptive RMS gate** (`adaptive-gate.ts`): instead of a fixed threshold, the gate tracks the ambient noise floor with an EMA **while closed** (frozen while a note rings, so long notes can't inflate it and eat their own decay tail) and opens at `floor × 4`, closing at `floor × 2.5` (hysteresis — no flutter as a note decays through the boundary). An absolute minimum (`0.003`) prevents a dead-silent input from opening on anything. The initial floor is chosen so the very first frames behave like the legacy fixed `0.02` gate until the estimator converges (~120 ms of silence). Because both thresholds scale with the floor, frame selection is approximately **gain-invariant**: different interfaces/gains capture the same population of frames.
4. **Onset detection** (in the gate, backend-agnostic): a window is an *onset* if the gate just opened, or RMS jumped >2× over the previous window (re-pluck of a ringing string). The flag is carried "pending" in the processor so that if the backend drops the attack frame, the *next* delivered frame still announces the pluck. The gate also emits **SNR** = `log10(rms / floor)`, a gain-invariant loudness measure used as a model feature.
5. **Feature extraction** (backend): described in §4. The backend returns `null` for any frame it cannot analyze reliably — unvoiced input, low pitch confidence, failed extraction, too few partials. **Dropped frames are never zero-filled**; fabricated zeros would be indistinguishable from legitimate feature values and poison the dataset.
6. **Transport**: the 22-slot `Float32Array` is enqueued into a SharedArrayBuffer ring buffer. The main thread polls it every 16 ms. Whole frames are written atomically, so the reader always dequeues a multiple of 22 floats.

### SAB frame layout (`FEATURE_POSITIONS`, 23 slots)

| Slot | Name | Producer | Notes |
|---|---|---|---|
| 0 | PITCH | backend | Hz, YIN/Macleod |
| 1–13 | MFCC (13) | backend | mel-cepstral envelope |
| 14 | CENTROID | backend | essentia: normalized 0–1; meyda: bin index |
| 15 | ROLLOFF | backend | Hz |
| 16 | FLUX | backend | essentia only (0 in meyda) |
| 17 | INHARMONICITY | backend | essentia's generic scalar (0 in meyda) |
| 18 | RMS | processor | window energy |
| 19 | PITCH_CONFIDENCE | backend | YIN confidence / Macleod probability |
| 20 | INHARMONICITY_B | backend | **log10(fitted B)** (0 in meyda) |
| 21 | ONSET | processor | 1 on the first frame of a pluck |
| 22 | SNR | processor | log10(rms / noise floor), gain-invariant |

---

## 4. The features, and why each one helps

### 4.1 Model input vector — essentia path (22 per frame)

Order matters and must match between `recording-engine.saveData` and `prediction-engine.makeSequencePrediction`:

```
[ mfcc×13, midiNote, centroid, flux, rolloff, inharmonicity, rms, log10(B), onset, snr ]
```

| Feature | What it measures | Why it discriminates strings |
|---|---|---|
| **13 MFCCs** | Smoothed spectral envelope on the mel scale | Overall timbre: wound vs plain strings, body filtering. Weak below ~500 Hz (mel bands are coarse there) |
| **midiNote** | Rounded pitch | *Context*, not discrimination — timbre varies per note, so the net conditions on it |
| **Spectral centroid** | Spectral "center of mass" (essentia: normalized 0–1) | Brightness; a shorter vibrating length sounds brighter at equal pitch |
| **Spectral flux** | Frame-to-frame spectral change | Attack vs steady state |
| **Spectral rolloff** | Frequency below which 85% of energy lies (Hz) | High-frequency content of winding noise / pluck |
| **Inharmonicity (essentia)** | Weighted deviation of spectral peaks from harmonics of the first peak | Generic stiffness proxy; noisy, kept for continuity |
| **RMS** | Window energy | Decay slope across the sequence — thicker strings and higher frets decay differently |
| **log10(B)** — *the star feature* | Fitted stiffness coefficient of the inharmonic string model | Directly measures string construction; see below |
| **Onset flag** | 1 on the pluck's first frame | Tells the net whether a frame is attack or decay, so both are usable |
| **SNR** | log10(rms / noise floor) from the adaptive gate | Gain-invariant loudness/decay: unlike raw RMS, comparable across interfaces and rooms |

### 4.2 The fitted inharmonicity coefficient B

Partials of a real (stiff) string are not at `n·f0` but at

```
f_n = n · f0 · √(1 + B·n²)
```

`B` grows with string stiffness/gauge and shrinks with vibrating length — precisely the physical quantities that differ when the same pitch is played on different strings (typical guitar range ≈ 1e-5…1e-3, several-fold between a wound low string fretted high and a plain string fretted low). This is the single most grounded discriminator, and the approach used in the string-classification literature (Abeßer; Barbancho's tablature work).

Implementation (`inharmonicity.ts`, driven from the essentia backend):

1. **Pitch-guided partial tracking**: for n = 1…10, search a ±4% window around the *expected* (inharmonicity-corrected) position — the running B estimate keeps high-partial windows centered. Peaks below 0.1% of the spectrum max are treated as noise and skipped.
2. **Log-magnitude parabolic interpolation** refines each peak to sub-bin accuracy (window main lobes are near-parabolic in the log domain; linear-domain parabolas have a systematic offset bias).
3. **Two-parameter least-squares fit** of `f_n² = F²·n² + F²B·n⁴`, then `B = coeff₂/coeff₁`. Fitting F² jointly avoids referencing any single measured partial as f0 — an error in the measured fundamental would otherwise propagate into every ratio and can even flip the fitted sign (this failure mode is captured in the unit tests).
4. Requires ≥4 measured partials, otherwise the frame is dropped. The feature is `log10(B)` clamped to [1e-6, 1e-2].

Additionally, the *generic* essentia `Inharmonicity` input is made meaningful by pitch-guiding `SpectralPeaks` (`minFrequency = 0.85·f0`, so the first peak is the true fundamental — essentia's algorithm treats the first peak as f0) and sanity-checking that the first peak is within ±15% of the YIN pitch.

### 4.3 Quality gates (why frames disappear)

A frame must pass **all** of: adaptive gate open → YIN pitch > 0 → YIN confidence ≥ 0.4 → windowing/spectrum/MFCC succeed → spectral peaks exist and match the pitch → ≥4 partials for the B fit. Anything else returns `null` and the frame never leaves the worklet. Downstream, the engines additionally range-check the note (per-string MIDI ranges while recording; instrument range at inference).

### 4.4 Meyda path (17 per frame)

```
[ mfcc×13, midiNote, centroid, rolloff, brightnessPerNote ]
```

`brightnessPerNote = midiNote / centroid` — a hand-crafted brightness-vs-pitch ratio. The meyda path cannot compute flux (needs the previous frame) or inharmonicity (no spectral peaks), which is exactly why it is the "performance" (fast) mode and the essentia path is the "precision" mode.

---

## 5. Sequences and the dataset

Single frames are noisy; the model consumes **sequences of 5 consecutive frames** (~116 ms).

A sequence must represent *one note from one continuous pluck*. Both engines flush their frame buffer when any of these break:

- the detected MIDI note changes,
- more than **150 ms** passes between accepted frames (`MAX_FRAME_GAP_MS`, ~6 hop periods — tolerates a few gated/dropped frames),
- an **onset** arrives (sequences align to pluck boundaries).

### DatasetEntry

```ts
{ midiNote, stringNum /* 0=high E … 5=low E */, noteName,
  features: number[5][22], normalizedFeatures: number[5][22] }
```

Recording flow (`RecordingControls`, opened with the "record" cheat code): pick a string index, play notes along it; frames are filtered to that string's plausible MIDI range; every 5 buffered frames become one labeled entry. `downloadDataset()` z-score-normalizes with dataset-wide per-feature mean/std and downloads **both** the dataset and the stats file — the stats are part of the model contract (see §7).

Datasets live in `public/datasets/` and are **fetched at runtime** (`dataset-loader.ts`), not imported — bundling them previously added ~16 MB gz to the build and made the PWA precache 46 MB.

### Train/validation split (`prepareStratifiedSplit`)

- One training sample per recorded sequence — no sliding windows across entries (windows that straddled two recordings were a major historical bug, see §8).
- Entries are grouped per class, shuffled with a **seeded PRNG** (mulberry32, default seed 42 — reproducible), and 20% of *each class* goes to validation. This matters because the capture flow records string-by-string: a naive tail split (TF.js `validationSplit`) would have validated on a single class.
- Shape check: entries whose `normalizedFeatures` aren't `[5][22]` are skipped, and an explicit error is thrown if nothing survives (the tell-tale sign of a dataset recorded with an older feature pipeline).

---

## 6. The model

Defined in `model.ts` (TensorFlow.js, lazily imported):

```
Input  [5 frames × 22 features]
  → Conv1D(filters=32, kernel=3, relu)     # local temporal patterns (attack→decay)
  → GlobalAveragePooling1D                 # time-position invariance
  → Dense(32, relu)
  → Dense(6, softmax)                      # string 0–5
```

Training: Adam, categorical cross-entropy, up to 100 epochs, batch 64, early stopping on `val_acc` (patience 5, minDelta 0.005), explicit `validationData` from the stratified split. The model is saved with `model.save('downloads://…')` and manually placed into `public/model/`.

It is deliberately small: it runs on the main thread in real time alongside the audio worklet, and the engineered features carry most of the signal.

---

## 7. Inference path

1. Frames stream in exactly as during recording (same worklet, same gates) — **train/inference symmetry is the core invariant of this codebase**.
2. A sliding 5-frame buffer (with the same flush rules) produces a sequence per hop.
3. Features are assembled *in the same order as `saveData`* and normalized with the stats **embedded in the model manifest** (`public/model/manifest.json`). The manifest is the single source of truth per mode: model filename, backend, feature count, sequence length, pipeline version, and normalization stats travel as one artifact. At load time (`loadResourcesForMode` → `model-manifest.ts`) dimension mismatches — stats vs entry, entry vs running pipeline, entry vs the *actual* loaded model input shape — disable the model with explicit console errors, and pipeline-version drift logs a loud "retrain recommended" warning. Manifest entries are generated by `trainModel`, never written by hand.
4. **Feasibility masking**: for the detected pitch, only strings whose implied fret is within 0–24 are physically possible (C3 → 2 candidates; open E2 → 1). The softmax argmax runs only over feasible classes. This is a free accuracy win and needs no retraining.
5. `calculateLocation` converts (midi, string) → fret.
6. **RxJS stabilization**: raw predictions pass through a sliding window (`bufferCount(5,1)`); a (string, fret) pair must win ≥70% of the window to emit. An emitted prediction auto-clears after 5 s of silence (`switchMap` + timer).

---

## 8. Recent changes (2026-07) and their rationale

These were made in one review-and-fix pass; the "before" states are documented because several invalidated old artifacts.

| Change | Problem it fixed |
|---|---|
| **Stratified seeded split + `validationData`** | Dataset is ordered by string; TF.js `validationSplit` took the tail → validation was ~one class, `val_acc` and early stopping were meaningless |
| **One sample per sequence** (no stride-1 re-windowing) | 4 of 5 training windows straddled two unrelated recordings; also inflated data ~5× with near-duplicates (train/val leakage) |
| **Buffer flush on note change / 150ms gap / onset** | Sequences glued frames from different plucks or notes; the label came from the last frame only |
| **Real sample rate into MFCC/RollOff/SpectralPeaks (+ `Meyda.sampleRate`)** | Everything assumed 44.1 kHz; on 48 kHz hardware all frequency-axis features were ~9% off → train/inference distribution shift between devices |
| **Drop-on-failure (`process(): Float32Array \| null`)** | Failed extractions were serialized as zeros and recorded as data |
| **Pitch-guided `SpectralPeaks` + fundamental sanity check** | Sub-fundamental noise became "f0" for the inharmonicity computation |
| **Fitted log10(B)** (new feature) | The generic inharmonicity scalar is noisy; B is the physical string signature |
| **RMS + onset as model features; YIN confidence gate (0.4)** | Decay information and attack alignment were discarded; octave-error frames polluted labels |
| **Feasibility masking at inference** | Impossible strings could win the argmax and the prediction was discarded instead of falling back |
| **Backend branch by `activeBackendType`** | Meyda recordings silently took the essentia feature layout (dead-code 17-feature branch) |
| **`brightnessPerNote` direction unified** (`note/centroid`) | Recording and inference computed reciprocal features |
| **Datasets to `public/datasets/` + 2MB precache tripwire** | 46 MB PWA precache on first visit; datasets were bundled as JS |
| **Adaptive RMS gate + SNR feature** | Fixed 0.02 gate was interface-gain dependent (quiet setups captured nothing, hot ones passed noise tails, datasets coupled to hardware); raw RMS feature carried the same gain dependence — SNR = log10(rms/floor) is the gain-invariant replacement signal |
| **Model manifest with embedded stats + load-time validation** | Model and normalization stats were paired by hand across two files; a stale path silently skewed every prediction. Now one generated artifact, validated against the running pipeline and the loaded model's real input shape |
| **Parameterized base recorder processor** | The two worklet processors were near-verbatim duplicates; shared logic (gate, onset, SAB transport) had to be edited twice and could drift. Now one `base-recorder-processor.ts` + two thin per-backend entry modules (kept separate so each worklet bundle only carries its own backend) |
| **Worklet imports switched to `?worker&url`** | Plain `?url` never compiles TS in production builds — `addModule()` received a data-URI of raw TypeScript, so **worklets could not load in any production build** (dev worked because Vite transforms on the fly). `?worker&url` emits real compiled per-backend bundles; they are excluded from the PWA precache (opt-in feature, essentia bundle ~2.4MB) |

**Consequences for artifacts**: the bundled dataset (18-feature frames) and both deployed *essentia* models predate these changes. The essentia/"precision" path will not predict until a new dataset is recorded and a model retrained; `prepareStratifiedSplit` fails fast with an explanatory error. The meyda/"performance" path (17 features, unchanged layout) still works.

---

## 9. Current limitations

**Pipeline / engineering**

- **Heavy DSP on the realtime audio thread.** The essentia chain (2 windowings, 2 FFTs, YIN, MFCC, peaks, partial fit) runs inside `process()` with a ~2.7 ms budget per quantum. Slow devices may glitch, dropping the very input being analyzed. The correct architecture is: worklet ships raw audio over the SAB, a Worker extracts features.
- **Ring-buffer wraparound assumption.** The in-worklet FIFO resets indices to 0 on wrap, which is only correct because every push (128 quanta, 1024 overlap re-push) divides the 2048 capacity exactly. A non-128 render quantum would corrupt audio silently.
- **SharedArrayBuffer requires cross-origin isolation** (`vite-plugin-cross-origin-isolation` in dev; COOP/COEP headers in production). Browsers without it get no audio features at all.

**Data / model**

- **Single-guitar, single-style dataset**, recorded string-by-string in one session. The model likely learns session artifacts; generalization to other guitars/pickups is unproven.
- **~116 ms sequences** may miss slower decay differences; sequence start is now onset-aligned, but only the first sequence of a pluck contains the attack.
- **MFCC resolution at low frequencies** is poor exactly where partials 1–4 of low notes live; the fitted B and future harmonic features compensate.
- **Octave errors**: YIN octave slips within the per-string range filter still mislabel `midiNote`; confidence gating reduces but does not eliminate them.
- **B is undefined for the meyda path**, so performance mode still relies on envelope features only.
- **Class imbalance & note coverage**: only pitch ranges shared by ≥2 strings actually need the model; the dataset isn't concentrated there.

---

## 10. Roadmap: further improvements

Ordered roughly by expected value per effort.

1. **Harmonic-structure features** (small, high value): normalized magnitudes of the first ~8 partials (dB re: partial 1) — captures pluck-point comb filtering directly; essentia's `Tristimulus` and `OddToEvenHarmonicEnergyRatio` come nearly free since peaks are already computed. Requires growing `NUM_FEATURES` + retraining.
2. **Worker migration** of feature extraction (fixes the realtime-budget limitation), which then enables a **4096-sample window for the partial fit** — halves B-estimation error for low notes.
3. **Recording protocol**: multiple dynamics, pick vs finger, several pluck positions, fresh vs worn strings; concentrate on note ranges shared between strings. B survives these variations; raw envelopes don't — which is what makes it worth collecting them. The full procedure is specified in **[recording-protocol.md](recording-protocol.md)**.
4. **Per-pluck aggregation at inference**: aggregate all sequences of one pluck (median of per-sequence softmax, weighted by confidence/RMS) instead of the generic sliding majority vote.
5. **Physics-prior hybrid**: per-guitar calibration pass that measures B per (string, fret) once, then classifies by nearest-B with the network as a tie-breaker. Would personalize accuracy cheaply and degrade gracefully.

**Alternative model architectures**, if engineered features plateau:

| Architecture | Input | Trade-off |
|---|---|---|
| Current: Conv1D + GAP (≈3k params) | 5×21 engineered features | Tiny, fast, interpretable; ceiling limited by features |
| Small GRU/LSTM or TCN | Longer feature sequences (10–20 frames) | Models decay trajectories explicitly; still cheap |
| CNN on CQT / log-mel spectrogram patches | ~200 ms spectrogram around the onset | State of the art in the tablature literature (Kehling et al., Wiggins & Kim); needs far more data + augmentation, heavier in-browser |
| CRNN (CNN front-end + recurrent head) | Spectrogram | Best published results for string/fret; likely overkill until the data protocol matures |
| Transfer learning (e.g., pretrained audio embeddings + small head) | Raw audio | Big downloads; conflicts with the PWA size budget |

The honest guidance: **data quality and train/inference symmetry have been worth more than architecture here**. Every historical accuracy problem in this project traced back to leakage, mislabeled sequences, or feature mismatches — not model capacity.

---

## 11. Runbook: record → train → deploy

> For dataset quality, follow the full **[recording protocol](recording-protocol.md)** — coverage plan, variation grid, and sanity checks. The steps below are the mechanical minimum.

1. `npm run dev`, open the app, type `record` (cheat code) to open the Recording Studio; grant mic access, `Init`.
2. For each string 0–5: press `Start n`, play notes along that string (each sustained pluck yields several sequences), `Stop`.
3. Download dataset + stats. Place the dataset under `public/datasets/<name>/guitar_dataset.json` and keep the stats file with it.
4. Point `model.ts` (`fetchDataset`) at it if the name changed; run training from the Recording Studio (`Train Model`). Watch per-epoch `val_acc` in the console.
5. Training downloads **three artifacts**: the model JSON + weights, and a generated `manifest-entry-*.json` (model pointer, feature/sequence dims, pipeline version, embedded normalization stats). Move the model files into `public/model/` and paste the entry under the right mode key in `public/model/manifest.json`. Never edit dims/stats by hand — the prediction engine validates the entry against the running pipeline *and* the loaded model's real input shape, and disables the model with console errors on any mismatch.
6. Verify: `npx vitest run` (pipeline math), then live: precision mode, play the same pitch on two strings, watch the overlay.
