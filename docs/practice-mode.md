# Practice Mode: Spaced Repetition for Fretboard Geometry

> *Versión en español: [practice-mode.es.md](practice-mode.es.md). If you edit this document, update the translation (or at least its sync date).*

This document explains how Practice Mode teaches the fretboard: what it treats as a unit of knowledge, how the spaced-repetition scheduler works, how a session is assembled, and how the whole thing plugs into the existing Fretboard widget without disturbing Scale or Chord mode.

Audience: a developer new to this part of the project. No music theory beyond "an interval is a distance between two notes" is assumed.

---

## 1. The problem

Learning the fretboard is usually taught as **memorising shapes in positions** — the five pentatonic boxes, the CAGED chord forms. That works for playing, but it fails badly as spaced-repetition material:

- A box in a key is one big item. There is nothing to schedule at a useful granularity.
- Practising box 1 in A minor teaches *fret numbers*, not the shape. Move to C minor and the knowledge does not transfer.
- Scheduling "(string, fret) in key X" gives ~360 items. The deck never converges.

What a guitarist actually needs to know, and what generalises, is **how to get from one note to another**: from this note, where is the 5th? Where is the same note an octave up? That is the unit Practice Mode schedules.

The insight that makes this work is small and exact:

> Moving from string `from` to string `to` with a fret displacement `delta` always produces the same interval, **regardless of which fret you started on**.

Moving from the A string to the low E string at the same fret gives the 5th at fret 3 as surely as at fret 12. The move is therefore transposition- *and* position-independent — one item generates unlimited questions, so the learner cannot memorise the question instead of the answer.

`fretboardMoves.test.ts` asserts this exhaustively over every (string pair × delta × starting fret) combination on a standard guitar. If that test ever fails, the entire deck design has collapsed and nothing else in this document holds.

---

## 2. The geometry

A move is fully described by four numbers:

```ts
interface MoveSpec {
    from: number;      // string index (0 = drawn first; high E on a standard guitar)
    to: number;        // string index
    delta: number;     // frets to add on the destination string
    interval: number;  // semitone class 0-11 the move produces
}
```

And the whole theory is one line (`fretboardMoves.ts`):

```ts
const intervalOf = (pitches, from, to, delta) =>
    (((pitches[to] + delta) - pitches[from]) % 12 + 12) % 12;
```

`pitches` is each open string's absolute semitone value with tuning offsets already applied. Passing pitches rather than an instrument name is deliberate: altered tunings, extended-range guitars and bass are then handled *by construction* instead of by special cases.

### 2.1 The adjacent-move table

For a standard 6-string guitar, moving one string toward the bass:

|            | d+0 | d+1 | d+2 | d+3 | d+4 |
|------------|-----|-----|-----|-----|-----|
| str1 → str2 | 5  | b6  | 6   | b7  | 7   |
| str2 → str3 | b6 | 6   | b7  | 7   | 1   |
| str3 → str4 | 5  | b6  | 6   | b7  | 7   |
| str4 → str5 | 5  | b6  | 6   | b7  | 7   |
| str5 → str6 | 5  | b6  | 6   | b7  | 7   |

Read the other way — what displacement realises a given interval:

```
  5th   str1>str2: +0   str2>str3: -1   str3>str4: +0   str4>str5: +0   str5>str6: +0
  3rd   str1>str2: -3   str2>str3: -4   str3>str4: -3   str4>str5: -3   str5>str6: -3
  4th   str1>str2: -2   str2>str3: -3   str3>str4: -2   str4>str5: -2   str5>str6: -2
```

### 2.2 The kink, and why it is derived

Adjacent string gaps on a standard guitar are `[5, 4, 5, 5, 5]` semitones. **The B/G pair is the only irregular one**, and it shifts *every* interval by exactly one fret. The entire difficulty of the guitar fretboard is one rule with one exception.

This is derived from the tuning, never hardcoded (`getIrregularPairs`):

| Instrument | Adjacent gaps | Irregular pairs |
|---|---|---|
| Guitar 6 (standard) | `[5, 4, 5, 5, 5]` | B/G only |
| Guitar 7 / 8 | `[5, 4, 5, 5, 5, …]` | B/G only |
| Bass 4 | `[5, 5, 5]` | **none** — uniform fourths |
| Guitar 6, Drop D | `[5, 4, 5, 5, 7]` | B/G **and** A/D |

Hardcoding "B/G is special" would silently produce wrong drills in Drop D and invent a difficulty that does not exist on bass.

Note that **nothing in the scheduler special-cases the kink either**. Those items accumulate lapses and lose ease on their own, so ordinary SM-2 surfaces them more often. `getIrregularPairs` exists so the *UI* can teach the rule, not so the algorithm can compensate for it.

### 2.3 Choosing the displacement

`findDelta` normalises to `(-6, 6]` — the smallest hand movement. A displacement of exactly 6 is equally far in either direction and canonicalises positive, so low anchors stay on the board.

Minimising the *fret displacement* rather than the *pitch distance* matters. A major 3rd from string 1 to string 2 is `delta = +9` if you insist on the 3rd being above the anchor, and `delta = -3` if you accept the nearest instance. The second is the shape a hand actually forms.

When the canonical displacement runs off the end of the neck, `deltaAlternatives` returns the octave-shifted options nearest-first. In practice `FRETS = 18` and `|delta| ≤ 6`, so a playable anchor always exists; the function is the documented escape hatch for short necks and a future difficulty knob.

---

## 3. System overview

```
 shared/lib/music/fretboardMoves.ts        (pure geometry, no React, no storage)
 ┌──────────────────────────────────────────────────────────────┐
 │ getOpenStringPitches  instrument + tuning -> semitone array   │
 │ intervalOf / findDelta  the move <-> interval bijection       │
 │ enumerateMoves        deck for {intervals, skips}             │
 │ getIrregularPairs     derives the B/G kink from the tuning    │
 │ playableAnchorFrets   board-bounds geometry                   │
 │ makeContextKey        namespaces progress per tuning          │
 └──────────────────────────────────────────────────────────────┘
     │ MoveSpec[]                                   │ contextKey
     ▼                                              ▼
 shared/lib/srs/deck.ts                     shared/lib/srs/storage.ts
 ┌────────────────────────────────┐         ┌──────────────────────┐
 │ selectSessionItems  due + new  │         │ localStorage         │
 │ takeNext            chaining   │◀────────│ 'fretboard-srs-v1'   │
 │ submitAnswer        requeue    │  cards  │ contexts[key][id]    │
 │ generateQuestion    anchors    │         └──────────────────────┘
 └────────────────────────────────┘                   ▲
     │ Question                                       │ SrsCard
     ▼                                                │
 shared/lib/srs/scheduler.ts ─────────────────────────┘
 ┌──────────────────────────────────────────────────────────────┐
 │ gradeFromLatency  correct + response time -> Grade            │
 │ review            SM-2 variant, pure, never mutates           │
 │ getStrength       0..1 for a future heat map                  │
 └──────────────────────────────────────────────────────────────┘
     │
     ▼
 pages/PracticeMode/ui.tsx   ──practice prop──▶  widgets/Fretboard
                                                 └─▶ entities/note/FretCell
```

Every module below the page is pure: no React, no DOM, no timers. That is what makes the 98 tests in `fretboardMoves.test.ts`, `scheduler.test.ts`, `deck.test.ts` and `storage.test.ts` possible without rendering anything.

---

## 4. The deck

### 4.1 Item identity

An item is a move, keyed `"{from}>{to}:{interval}"` — e.g. `4>5:7` is "string 5 to string 6, the 5th".

Items are namespaced by tuning context (`makeContextKey`):

```
GUITAR-6                    standard
GUITAR-6-0.0.0.0.0.-2       Drop D
BASS-4                      bass
```

`4>5:7` means a *different move* after a retune, so review history must not carry across. Retuning forks the deck rather than migrating it: progress in standard tuning stays intact and untouched, and the learner starts a fresh deck for the new geometry.

### 4.2 Stages

Each stage adds intervals to the previous one, so a later stage re-reviews everything already built. `STAGE_ORDER` is the intended progression:

| Stage | Intervals added | Deck size (skips `[1]`) |
|---|---|---|
| `ROOT_AND_FIFTH` | 5th, unison/octave | 20 |
| `TRIADS` | major 3rd, minor 3rd | 40 |
| `PENTATONIC` | 4th, minor 7th | 60 |
| `FULL_SCALE` | 2nd, 6th, major 7th | 90 |

A test asserts each stage is a strict superset of the one before. Twenty items at stage 1 is a genuinely completable first session, which matters more than it sounds — whether someone returns on day two is the whole game.

### 4.3 String skipping

`skips` is an array, not a maximum: `[1, 2]` drills adjacent *and* two-string moves, while `[2]` alone isolates octave shapes. Ordered pairs for skip *k* on *n* strings is `2 × (n − k)`.

| Instrument | `skips: [1]` | `skips: [1, 2]` |
|---|---|---|
| Guitar 6 | 10 pairs | 18 pairs |
| Guitar 8 | 14 pairs | 26 pairs |

The UI offers `1 … min(4, stringCount − 1)`. Crossing more than four strings stops being a shape anyone reaches for, and the picker adapts to extended-range instruments automatically. Deselecting the last active skip is refused — an empty deck has no recoverable UI state.

---

## 5. Scheduling

`scheduler.ts` is an SM-2 variant with two departures from flashcard scheduling, both forced by what is being learned.

### 5.1 Grading is automatic

A tap is objectively right or wrong and the app times it, so there is no "how well did you know it?" button. **Latency is the signal**: fretboard knowledge that takes four seconds is useless mid-phrase, so a slow correct answer is deliberately treated as weak.

| Response | Grade | Effect |
|---|---|---|
| Wrong, at any speed | `AGAIN` | `reps → 0`, `lapses++`, `ease − 0.20`, interval 0 |
| Correct, ≤ 1500 ms | `EASY` | `ease + 0.05`, interval `× ease × 1.3` |
| Correct, ≤ 3000 ms | `GOOD` | interval `× ease` |
| Correct, > 3000 ms | `HARD` | `ease − 0.15`, interval `× 1.2` |

Ease is clamped to `[1.3, 2.8]` from a default of 2.5. The first two successes use fixed steps (`GOOD`: 1 then 3 days; `EASY`: 2 then 5) because compounding by ease from an interval of 0 would never leave day one.

A lapse restarts the ladder but **keeps ease, lapse count and speed history**, so a card that has failed repeatedly stays permanently more frequent than a fresh one. One miss does not erase a fluent record.

### 5.2 Two timescales

Day-scale intervals decide only **which items enter a session**. Re-drilling *inside* a session is `deck.ts`'s job.

This is the mistake to avoid when porting flashcard scheduling to an instrument. A practice session is 10–30 minutes; a scheduler that answers "in 4 days" would end the session after a dozen taps. The session queue provides the short loop (§6), the scheduler the long one.

### 5.3 Derived signals

```ts
getStrength(card)   // 0..1 — 60% schedule maturity (interval/21) + 40% speed
isMastered(card)    // reps >= 3 && intervalDays >= 3 && avgMs <= 1500
```

`getStrength` blends schedule with speed on purpose: a card merely *scheduled* far out but answered slowly should not read as mastered. `avgMs` is an EWMA (weight 0.3 on the newest sample) over correct answers only.

Nothing paints `getStrength` yet — see §9.

---

## 6. The session

### 6.1 Assembly

`selectSessionItems` returns everything due (oldest first, ties broken by id for reproducibility), then new moves up to a cap:

```ts
DEFAULT_SESSION_CONFIG = { maxItems: 20, maxNew: 4, lapseRequeueGap: 5 }
```

**The new-item cap is the single most important guard here.** Introducing unlimited new moves feels productive on day one and buries the learner in reviews by day four. Four per session is conservative on purpose: the failure mode it prevents is much worse than the one it causes.

### 6.2 Traversal, not a shuffle

A session is a walk across the neck. Each correct answer leaves the learner standing on the note they just found, and the next move departs from there:

```
  anchor: str1 fret15 (G)   "-> Perfect 5th, on string 2"
      tap str2 fret15 (D)   correct
  anchor: str2 fret15 (D)   "-> Perfect 5th, on string 3"
      tap str3 fret14 (A)   correct        <- note the -1: B/G crossing
  anchor: str3 fret14 (A)   ...
```

`takeNext` scans the queue for an item that departs from where the learner stands and rotates it to the front; if nothing chains it takes the head and re-anchors. Preferring rather than requiring keeps the walk natural without ever stalling the queue.

Cells on the destination string are the only tappable ones. The question is therefore *which fret on this string*, which is exactly the item being scheduled — and it stops players routing around the B/G crossing to avoid the hard case.

### 6.3 Errors re-anchor

A miss reveals the correct position, re-queues the item `lapseRequeueGap` questions later, and **clears the anchor** so the next question starts somewhere known-good. Without this, one wrong guess would cascade into a run of questions asked from the wrong place.

The re-queue is the within-session loop that day-scale intervals cannot provide. A test drives a full session missing every item once and asserts the queue still drains.

### 6.4 Pacing

A correct answer auto-advances after 650 ms. A miss waits for an explicit **Continue** — the learner needs time to look at where the note actually was, and stealing that moment defeats the purpose of revealing it.

---

## 7. UI integration

### 7.1 Why not an overlay

The obvious approach — absolutely position a quiz layer over the board using the existing `fret-${string}-${fret}` DOM ids, as the interval-measurement overlay does — was rejected. That overlay relies on a `setTimeout(50)` plus a resize listener to stay aligned, which is fragile enough already.

Instead the board itself renders the question, via one contained prop:

```ts
interface PracticeLayer {
    cellStates: Map<string, PracticeCellState>;  // keyed "stringIndex-fret"
    onCellClick: (stringIndex: number, fret: number) => void;
    locked: boolean;
}
```

Passing `practice` overrides `isActive` per cell and suppresses the measurement interaction, which would otherwise compete for the same clicks. `PracticeMode` passes `scaleNotes={[]}` so nothing else lights up, and `selectedRoot={anchorNote}` so the existing interval labels render *relative to where the learner stands* — no new interval logic.

### 7.2 Cell states

| State | Marker | Meaning |
|---|---|---|
| `ANCHOR` | visible, ring | where the learner is standing |
| `CANDIDATE` | **hidden** | tappable; finding it is the question |
| `CORRECT` | visible, green | the tap, and it was right |
| `WRONG` | visible, red | the tap, and it was wrong |
| `REVEAL` | visible, amber | the answer, shown only after a miss |

`CANDIDATE` cells carry no marker, and hidden markers have `pointer-events: none`. The hit target therefore has to live on the `.fret` div itself — this is why `FretCell` gained an `onPracticeClick` prop rather than reusing the note-marker click path.

While `locked` (after an answer, before advancing) the destination string stays lit for context but stops advertising as tappable, so it cannot invite taps that are no longer accepted.

### 7.3 Two traps

**`FretCell` is memoized with a hand-written comparator.** Any new prop absent from it silently fails to re-render. Practice mode added two lines: `practiceState`, and a `!!onPracticeClick` identity check. The second is not optional — that callback flips between a handler and `undefined` as cells become answerable, and omitting it freezes cells un-tappable mid-session.

**Session state is reset during render, not in an effect.** `PracticeRun` is one consolidated object carrying a `signature` of the deck it belongs to; a mismatch rebuilds it inline. An effect would paint one frame of the *previous* deck's question after a stage change. This is React's sanctioned "adjust state when a prop changes" pattern and it also keeps the new code clear of `react-hooks/set-state-in-effect`.

Response time is measured from an effect keyed on the question, so latency reflects when the learner could actually *see* it rather than when state updated.

---

## 8. Persistence

One `localStorage` entry, `fretboard-srs-v1`, namespaced by tuning context:

```jsonc
{
  "version": 1,
  "contexts": {
    "GUITAR-6": {
      "0>1:7": { "id": "0>1:7", "ease": 2.55, "intervalDays": 2,
                 "due": 1786979309360, "reps": 1, "lapses": 0, "avgMs": 969.3 }
    }
  }
}
```

The store degrades rather than throws: corrupt JSON, a future `version`, and malformed card objects all fall back to an empty deck; quota errors and private-mode `SecurityError`s are caught so practice keeps working when only history is lost. A version bump is a single delete.

---

## 9. Current limitations

- **No heat map.** `getStrength` returns the 0..1 value a fretboard memory map needs, but nothing paints it. Progress is only visible inside a session, which is the weakest part of the current gamification.
- **Latency bands are guesses.** 1500 ms / 3000 ms are reasonable starting points, untested against real playing. They are exported constants precisely so they can be retuned once there is usage data.
- **Ukulele is unsupported.** Re-entrant tuning breaks "higher string index = lower pitch"; the derivation produces nonsense. Either sort strings by pitch or keep Practice Mode to guitar and bass.
- **One question format.** Only "find the note" exists. The reverse direction — *name* the interval between two lit notes — would give the scheduler a second view of each item, and the measurement overlay already implements most of it.
- **No octave-shifted variety.** `deltaAlternatives` exists but questions always use the canonical displacement, so the same item always looks the same on the board.
- **Session length is fixed** at 20 items rather than adapting to how the learner is doing.

---

## 10. Roadmap

Ordered roughly by expected value per effort.

1. **Fretboard heat map** — paint `getStrength` onto Scale mode's board via a `--strength` custom property, mirroring how `--octave` already drives OKLCH lightness in `NoteMarker.css`. Makes progress visible on the thing being learned, outside a practice session. Cheap; highest impact of anything listed here.
2. **"Name the interval" questions** — two notes lit, pick from a degree pad. Reuses `getDetailedInterval` and the measurement overlay. Gives each item a recall *and* a recognition view.
3. **Teach the kink explicitly** — a one-off explainer driven by `getIrregularPairs`, shown when the learner first meets a B/G crossing. The data is already derived; only the presentation is missing.
4. **Chained multi-hop questions** — "build a major triad from here" as three graded hops. Stage 2+ material that exercises several items per question.
5. **Tune the latency bands** against real sessions; consider making them per-learner (a percentile of their own history) rather than absolute.
6. **Adaptive session length** — end on a strong answer rather than a fixed count, and cap by wall-clock time as well as item count.

---

## 11. Working on this

```bash
npx vitest run src/shared/lib/music/fretboardMoves.test.ts src/shared/lib/srs
```

The pure layer is fully covered (98 tests) and fast. Points worth knowing:

- **`fretboardMoves.test.ts` asserts fret-independence exhaustively.** Treat a failure there as a design-level regression, not a bug.
- Deck-size expectations (`20 / 40 / 60 / 90`) are asserted, so changing `STAGES` will fail loudly and deliberately.
- `deck.test.ts` drives whole sessions — all-correct, all-missed-once, random anchors — and asserts every generated question lands on the board.
- Storage tests cover corrupt payloads, version mismatch, quota failure and read failure.

To exercise the UI: `npm run dev`, open **Practice**. Note that `useIsMobile()` reads `matchMedia('(max-width: 600px)')`, which matches when a headless viewport reports 0×0 — set an explicit viewport size before concluding the desktop layout is broken.
