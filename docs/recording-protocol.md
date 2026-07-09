# Dataset Recording Protocol

> *Versión en español: [recording-protocol.es.md](recording-protocol.es.md). If you edit this document, update the translation (or at least its sync date).*

A step-by-step protocol for recording a training dataset for the string-classification model. Follow it exactly and you get a dataset that is balanced, label-clean, and concentrated where the model actually earns its keep. Cut corners and you get a model that memorizes your recording session instead of your strings.

Companion doc: [audio-pipeline.md](audio-pipeline.md) — what happens to the audio you record.

---

## 0. Principles (why the protocol looks like this)

1. **The model only matters where pitches overlap.** At inference, feasibility masking already eliminates strings that can't produce the detected note. E2–G#2 exist only on string 6 — no model needed. G3 exists on four strings — that's where the model works. Recording effort follows that value.
2. **The label is the string you selected in the UI — nothing verifies it.** The per-string pitch filter rejects notes *outside* the string's range, but overlapping ranges mean a wrong string selection often still passes. Operator discipline is the only defense.
3. **What must vary, what must not.** The string signature (inharmonicity B, decay) survives changes in dynamics, plucking style, and pluck position — the nuisance features (raw spectral envelope) don't. So we *deliberately vary* everything that is not the string, and the model is forced to rely on what remains.
4. **Session fingerprints are the enemy.** If all of string 3 is recorded in one continuous take (one gain setting, one mic position, one pick grip), the model can classify the *take*, not the string. Interleave and split sessions.

---

## 1. Equipment & environment checklist

Do this once per session, before recording anything:

- [ ] **Tune precisely to A440.** The engine labels notes by rounding pitch to the nearest MIDI note — a string more than ±50 cents off gets *mislabeled wholesale*. Re-check tuning every ~15 minutes (fresh strings drift).
- [ ] **Same signal chain you'll use for prediction** (same guitar → same interface/mic). A dataset from a condenser mic will not transfer perfectly to a phone mic.
- [ ] **No clipping, healthy level.** The adaptive gate makes absolute level mostly irrelevant, but clipping is a hard nonlinearity that fabricates partials and corrupts the inharmonicity fit. Play your loudest test pluck and set interface gain so it peaks well below 0 dBFS (aim ≈ −12 dB headroom).
- [ ] **Disable any device-side AGC/"enhancement"** (some USB interfaces and most headset mics have it). The app already requests raw audio from the browser, but hardware AGC sits below that.
- [ ] **Quiet room.** The gate tracks the noise floor, so steady hum is tolerated — but TV, talking, or taps will open the gate and, if they carry pitch, can sneak frames in. Phone on silent.
- [ ] **Note the session metadata somewhere** (text file next to the dataset): date, guitar, string brand/gauge/age, pick type, interface, sample rate if you know it. Future you will need this.
- [ ] **Set the `Guitar tag` field** in the Recording Studio to this instrument's stable id (e.g. `strat-daddario-10s`) — every captured sequence embeds it as `guitarId` (§7). New strings = new tag.

---

## 2. Session hygiene (the small things that decide label quality)

- **Start with ~2 seconds of silence** after pressing `Start`. The adaptive gate needs ~120 ms of silence to learn the room's noise floor; give it margin.
- **One note at a time, cleanly fretted.** The pitch tracker is monophonic. No chords, no sympathetic open strings ringing (mute unused strings with your palm or a hair tie at the nut).
- **No vibrato, no bends, no slides.** Pitch modulation lowers YIN confidence (frames get dropped) and can cross the rounding boundary mid-note (sequence flushed, or worse, mislabeled).
- **Let each note ring ~2 seconds, then fully mute** with your palm and wait ~0.5 s before the next pluck. The silent gap (> 150 ms) flushes the sequence buffer and lets the gate re-track; each pluck then produces one onset-anchored sequence plus several clean decay sequences.
- **No harmonics, no dead/buzzing notes.** Fret buzz adds noise partials that poison the B fit; if a fret buzzes on your guitar, skip that fret and note it in the metadata.
- **Watch the console counter.** Each captured sequence logs `Captured sequence for <note>`. If the note name is not what you're playing — stop; you're detuned or the pitch tracker is octave-slipping on that note.

---

## 3. What to record per string

### 3.1 The coverage map

Standard tuning, frets 0–18 (the range the capture filter accepts). "Overlap zone" = pitches that exist on at least one other string; that's the priority.

| String (UI index) | Open | Fret range | Overlap zone (priority frets) | Unique zone (light coverage) |
|---|---|---|---|---|
| 5 — low E | E2 (40) | 0–18 | **frets 5–18** (A2–A#3, shared with A string and up) | frets 0–4 (E2–G#2, only string that has them) |
| 4 — A | A2 (45) | 0–18 | **all frets** (everything shared with low E and/or D) | — |
| 3 — D | D3 (50) | 0–18 | **all frets** | — |
| 2 — G | G3 (55) | 0–18 | **all frets** | — |
| 1 — B | B3 (59) | 0–18 | **all frets** | — |
| 0 — high E | E4 (64) | 0–18 | **frets 0–13** (E4–F5, shared with B string) | frets 14–18 (F#5–A#5) |

The most contested pitches (3–4 candidate strings) are roughly **G3–F4 (MIDI 55–65)** — the mid-fretboard box. Those cells deserve the most plucks.

### 3.2 The variation grid

For **each fret** you record, cover this grid — it's what forces the model onto the string signature:

| Dimension | Values | Why |
|---|---|---|
| Dynamics | soft, medium, hard | Attack spectrum and SNR trajectory change; B doesn't |
| Excitation | pick, fingertip (add thumb on low strings if you play that way) | Very different pluck transient |
| Pluck position | near bridge, over soundhole/middle, near neck | Moves the comb-filter notches through the harmonic series |

That's 3 × 2 × 3 = **18 plucks per fret** for full coverage. In practice a compressed pass works well:

- **Overlap-zone frets:** 6 plucks per fret — {soft, medium, hard} × {pick, finger}, rotating pluck position between plucks.
- **Unique-zone frets:** 2 plucks per fret (medium pick, medium finger). These only teach the model "what this string sounds like in general".

### 3.3 Expected yield & targets

Each ~2 s ringing pluck yields roughly 5–12 sequences (one onset-anchored + decay slices; hard plucks ring longer and yield more).

| Quantity | Target |
|---|---|
| Sequences per string | **≥ 1000** (previous dataset: ~700/string with dirtier labels) |
| Per (string, fret) cell in the overlap zone | ≥ 30 sequences (~6 plucks) |
| Class balance | max/min string count ≤ 1.5× — the stratified split doesn't fix imbalance, it only mirrors it |
| Time budget | ≈ 8–12 min recording per string; a full pass ≈ 1.5 h including breaks |

### 3.4 Recording order — interleave, don't batch

Do **two half-passes instead of one big take per string**, in different sittings (or at least separated by unplugging/re-plugging and re-tuning):

- Pass A: strings 5 → 0, frets 0–9, full variation grid.
- Pass B (later, ideally next day): strings 0 → 5, frets 10–18, full variation grid.

This puts every string in every session, so session artifacts (mic drift, humidity, your hand warming up) decorrelate from the class label. If you record with more than one guitar, give each its own `Guitar tag` and keep per-guitar files with metadata — mixing then becomes a deliberate, tagged act (§7), never an accident.

**Multi-day passes need no manual merging.** At the start of the later session, press `Import dataset` in the Recording Studio and select the previous pass's `guitar_dataset_<timestamp>.json`. New sequences append to it in memory, and the final `Download` produces one coherent dataset+stats pair with the stats computed over the whole pool. Do **not** concatenate two downloaded files by hand instead: each file's `normalizedFeatures` were z-scored with its own session's stats, so a naive concat embeds a per-session feature offset — precisely the session fingerprint this protocol exists to remove. (The import strips those stale values and re-normalizes everything at download time.)

**Crash safety.** Every captured or imported sequence is also autosaved to the browser's IndexedDB, and a successful `Download` clears that mirror. If the tab dies or reloads before you downloaded, the next Recording Studio open shows an *"Autosaved session found"* banner — `Restore` puts the sequences back in memory (they are validated like an import), `Discard` deletes them. The autosave only ever holds sequences that exist nowhere else, so restoring never duplicates a file you already downloaded.

---

## 4. Step-by-step session script

1. `npm run dev` → open the app → type `record` → Recording Studio opens.
2. Select your input device, press `Init`, grant mic access.
3. Set the **`Guitar tag`** to this instrument's id (it is remembered between sessions — verify it matches the guitar in your hands, especially if you rotate instruments).
4. **Pass B (continuing an earlier day)?** Press `Import dataset` and select the previous pass's `guitar_dataset_*.json` — the sequence counter should jump to the previous total. Recording appends from there. If an *"Autosaved session found"* banner appears instead, the previous session was never downloaded: `Restore` it (no import needed) or `Discard` it before recording.
5. Tune. Verify with a few test plucks that the console shows the right note names.
6. For each string in the pass plan:
   1. Press `Start <string index>` (**triple-check the index**: 0 = high E … 5 = low E — a wrong index here is a mislabeled batch that no filter will fully catch).
   2. 2 s of silence.
   3. Walk the planned frets low→high, executing the variation grid; mute + pause between plucks.
   4. Press `Stop`. Stretch, re-check tuning.
7. After the last string: **Download dataset + stats** (one button produces both files — they are a pair; the stats file is the normalization contract for the model you'll train).
8. Name them consistently, e.g. `guitar_dataset_<guitar>_<YYYYMMDD>.json` + matching stats, drop the dataset under `public/datasets/<name>/`, and write the metadata file next to them.

---

## 5. Post-recording sanity checks (10 minutes, non-optional)

Run a quick summary before training (adapt paths):

```bash
python3 - <<'EOF'
import json, collections
d = json.load(open('public/datasets/<name>/guitar_dataset.json'))
by_string = collections.Counter(e['stringNum'] for e in d)
by_cell = collections.Counter((e['stringNum'], e['noteName']) for e in d)
onset_seqs = sum(1 for e in d if e['features'][0][20] == 1)  # onset flag, first frame
print('total sequences:', len(d))
print('per string:', dict(sorted(by_string.items())))
print('onset-anchored sequences:', onset_seqs, f'({onset_seqs/len(d):.0%})')
print('thinnest cells:', by_cell.most_common()[:-8:-1])
EOF
```

Red flags and what they mean:

| Symptom | Likely cause | Fix |
|---|---|---|
| One string count ≪ others | Gate never opened (too gentle?) or frames failed the B fit | Re-record that string, pluck firmer |
| Note names off by a semitone in some cells | Drifted tuning during the session | Delete those entries or re-record the string |
| Notes present that you never played | Background sound / octave errors | Check environment; consider raising `MIN_PITCH_CONFIDENCE` |
| Very low onset-sequence fraction (< ~10%) | Plucks not separated by silence (buffer never flushed at attack) | Mute harder between plucks |
| A (string, note) cell exists on a string that can't produce it | **Wrong string index selected** | Delete those entries — do not train on them |

Then train (`Train Model` in the Recording Studio) and look at the **confusion between adjacent strings** implicitly: if validation accuracy is high but live predictions confuse strings 4/5 on low notes, your low-string cells are too thin — go back and thicken exactly those.

---

## 6. What *not* to do

- Don't record all dynamics batched ("all soft plucks first") — batch effects correlate with time and sneak into features like SNR.
- Don't ride the interface gain between strings. Changing it mid-dataset is survivable (SNR is gain-invariant, MFCCs mostly level-robust) but pointless variance.
- Don't record near a fan/AC that cycles on and off — a moving noise floor churns the gate and the SNR feature.
- Don't reuse a dataset after changing string gauge or brand. B *is* the string; new strings = new dataset (that's the feature working, not a bug).
- Don't pad thin cells with copies or synthetic noise — duplicated sequences leak across the train/val split and inflate validation accuracy, which is how this project got fooled once already.

---

## 7. Multi-guitar datasets (cross-guitar generalization)

Recording several guitars enables two things: an honest measurement of how well the model generalizes to instruments it never saw, and **family-specific models** (e.g. one for acoustics, one for electrics) trained by filtering on the tag. The single-guitar limitation is documented in [audio-pipeline.md](audio-pipeline.md) §9 — this section is the tooling to attack it.

- **Tag every session.** Set the `Guitar tag` field before recording; every captured sequence embeds it as `guitarId`. Use one stable id per instrument **and string set** (`strat-daddario-10s`) — a string change means a new tag, because B *is* the string (§6). Tags survive `Import dataset` merges, autosave restores, and downloads.
- **Full protocol per guitar.** Each instrument gets both passes and the full variation grid (§3). Balance matters across guitars too: keep max/min sequence counts per string ≤ 1.5× *between* guitars, or the pooled model quietly specializes in the best-represented one.
- **Start with comparable instruments.** Steel-string acoustics through the same signal chain are a winnable first experiment. A magnetic-pickup electric adds a fixed comb filter plus a different transducer response — treat electrics as their own family rather than expecting acoustic↔electric transfer. Nylon strings put B near the feature's clamp floor and will likely break the star feature entirely.
- **Evaluate with the leave-one-guitar-out split, never the stratified one.** The stratified split validates on guitars the model has already seen, so pooled `val_acc` says nothing about a new instrument. Press `Train` and enter the tag to hold out (leave empty for the normal stratified split), or call `trainModel(data, { holdOutGuitarId })`. Rotate the held-out guitar across runs. LOGO-trained models carry a `notes` marker in their manifest entry: they are for measurement, not deployment.
- **Known caveat**: `normalizedFeatures` are z-scored at download time with pool-wide stats, so a sliver of the held-out guitar leaks into normalization. This is second-order next to the effect being measured (per-guitar B multimodality); a train-only-stats mode is future work if the numbers get close.
- **Per-family specialists**: merge the files of one family via `Import dataset`, train normally (stratified split), and deploy the result as its own manifest entry with its own stats. Note the prediction engine currently loads the fixed `performance`/`precision` mode keys — exposing per-family model selection in the UI is a follow-up step.
- **Expectation setting**: a pooled multi-guitar model will usually score slightly *lower* on each individual guitar than a single-guitar specialist (class distributions become multimodal) — that is the price of robustness, not a regression. The held-out number is the one that matters.
