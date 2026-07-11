import {
    audioRecordingEngine,
    type EngineNoteEvent,
    type EngineSequenceEvent
} from '@/shared/lib/audio/recording-engine';
import {
    PLUCK_POSITION_LABELS,
    type FretTask,
    type PluckSpec,
    type SessionPlan,
    type StringTask
} from '@/shared/lib/audio/session-plan';

// Guided session runner (docs/recording-protocol.md §4): walks a SessionPlan,
// sets the string label on the engine itself (the operator never picks an
// index — the protocol's #1 mislabeling vector), prompts every fret + pluck
// variation, counts plucks via onset detection, and validates played notes
// against the expected fret. Plain TS singleton, same pattern as the engine.

export const TRANSITION_MS = 5000; // countdown before each string
export const ARM_SILENCE_MS = 2000; // protocol §2: silence after Start
export const RING_MS = 2500; // ~2s ring + 0.5s mute window per pluck
export const ONSET_DEBOUNCE_MS = 250; // gate can re-fire onset during one attack
export const EARLY_REPLUCK_MS = 1200; // matching onset before this → pace hint
export const PLUCK_TIMEOUT_MS = 12000; // prompt with no matching onset → hint
export const TUNING_REMINDER_MS = 15 * 60 * 1000; // protocol §1
export const WRONG_STRING_THRESHOLD = 3; // consecutive non-octave mismatches
export const PREV_CELL_GRACE_MS = 1500; // decay sequences after a fret advance
export const COUNTDOWN_TICK_MS = 250;
export const MAX_WARNINGS = 5;
const NOISE_WARNING_THROTTLE_MS = 1000;
const TUNING_TICK_MS = 30000;

// Structural subset of the engine — mock-injectable in tests
export interface RunnerEngine {
    startRecording(stringIndex: number): void;
    stopRecording(): void;
    onNoteEvent: ((event: EngineNoteEvent) => void) | null;
    onSequenceCaptured: ((event: EngineSequenceEvent) => void) | null;
}

export type RunnerPhase = 'idle' | 'transition' | 'armWait' | 'prompting' | 'ringing' | 'paused' | 'done';
export type WarningKind = 'noise' | 'mismatch' | 'octave' | 'wrongString' | 'timeout' | 'pollution';

export interface RunnerWarning {
    kind: WarningKind;
    text: string;
    atMs: number;
}

export interface StringProgress {
    stringIndex: number;
    label: string;
    fretsDone: number;
    fretsTotal: number;
    sequences: number;
    skippedFrets: number[];
}

export interface RunnerSnapshot {
    phase: RunnerPhase;
    plan: SessionPlan | null;
    stringPos: number;
    fretPos: number;
    pluckPos: number;
    currentString: StringTask | null;
    currentFret: FretTask | null;
    currentPluck: PluckSpec | null;
    countdownMs: number; // transition remaining, else 0
    cellSequences: number; // sequences for the current (string, fret) cell
    totalSessionSequences: number; // captured since start (imports not included)
    perString: StringProgress[];
    lastNote: { midi: number; noteName: string; match: boolean } | null;
    warnings: RunnerWarning[]; // newest last
    wrongStringAlert: boolean; // sticky until a matching onset
    tuningRecheckDue: boolean;
    paceHint: boolean; // re-plucked early — let notes ring ~2s
    pausedFromPhase: RunnerPhase | null;
    startedAtMs: number | null;
}

// "G#2" → "G sharp 2" so SpeechSynthesis doesn't read the hash sign
const speakableNote = (noteName: string) => noteName.replace('#', ' sharp ');
const pluckPhrase = (pluck: PluckSpec) =>
    `${pluck.dynamics}, ${pluck.excitation}, ${PLUCK_POSITION_LABELS[pluck.position]}`;

type Timer = ReturnType<typeof setTimeout> | null;

export class SessionRunner {
    onAnnounce: ((text: string) => void) | null = null; // speech hook, wired by the UI

    private phase: RunnerPhase = 'idle';
    private plan: SessionPlan | null = null;
    private stringPos = 0;
    private fretPos = 0;
    private pluckPos = 0;
    private perString: StringProgress[] = [];
    private cellSequences = 0;
    private totalSessionSequences = 0;
    private lastNote: RunnerSnapshot['lastNote'] = null;
    private warnings: RunnerWarning[] = [];
    private wrongStringAlert = false;
    private consecutiveMismatch = 0;
    private paceHint = false;
    private pausedFromPhase: RunnerPhase | null = null;
    private startedAtMs: number | null = null;

    private countdownEndsAt = 0;
    private lastCountedOnsetAt = 0;
    private prevCell: { midi: number; expiresAt: number } | null = null;
    private lastTuningResetMs = 0;
    private lastNoiseWarningAt = 0;

    private transitionInterval: Timer = null;
    private armTimer: Timer = null;
    private ringTimer: Timer = null;
    private promptTimeout: Timer = null;
    private tuningTicker: Timer = null;

    private listeners = new Set<() => void>();
    private snapshot: RunnerSnapshot;
    private engine: RunnerEngine;
    private now: () => number;

    constructor(engine: RunnerEngine, now: () => number = Date.now) {
        this.engine = engine;
        this.now = now;
        this.snapshot = this.buildSnapshot();
        // Attached once, never detached (repo precedent: onDataCaptured);
        // handlers no-op outside active phases.
        engine.onNoteEvent = (event) => this.handleNoteEvent(event);
        engine.onSequenceCaptured = (event) => this.handleSequenceCaptured(event);
    }

    // --- public controls -------------------------------------------------

    start(plan: SessionPlan) {
        if (this.phase !== 'idle' && this.phase !== 'done') return;
        if (plan.strings.length === 0) return;
        this.plan = plan;
        this.stringPos = 0;
        this.fretPos = 0;
        this.pluckPos = 0;
        this.perString = plan.strings.map((s) => ({
            stringIndex: s.stringIndex,
            label: s.stringLabel,
            fretsDone: 0,
            fretsTotal: s.frets.length,
            sequences: 0,
            skippedFrets: []
        }));
        this.totalSessionSequences = 0;
        this.warnings = [];
        this.pausedFromPhase = null;
        this.startedAtMs = this.now();
        this.enterTransition();
    }

    // Transition only: begin the string without waiting out the countdown
    confirmReady() {
        if (this.phase !== 'transition') return;
        this.beginString();
    }

    pause() {
        if (this.phase === 'idle' || this.phase === 'done' || this.phase === 'paused') return;
        this.pausedFromPhase = this.phase;
        this.clearAllTimers();
        this.engine.stopRecording();
        this.phase = 'paused';
        this.emit();
    }

    resume() {
        if (this.phase !== 'paused') return;
        const from = this.pausedFromPhase;
        this.pausedFromPhase = null;
        if (from === 'transition') {
            this.enterTransition(); // fresh countdown
            return;
        }
        const current = this.currentString();
        if (!current) return;
        // Fresh arm silence: the startRecording drain discards pause leakage,
        // then the session continues at the same fret/pluck.
        this.engine.startRecording(current.stringIndex);
        this.enterArmWait();
    }

    skipPluck() {
        if (this.phase !== 'prompting' && this.phase !== 'ringing') return;
        this.advancePluck(true);
    }

    // Buzzing fret (protocol §2): skip and record it for the metadata file
    skipFret() {
        if (this.phase !== 'prompting' && this.phase !== 'ringing' && this.phase !== 'armWait') return;
        this.advanceFret(true);
    }

    skipString() {
        if (this.phase === 'idle' || this.phase === 'done' || this.phase === 'paused') return;
        this.advanceString();
    }

    // Ends the session; sequences already captured stay in engine.dataset
    abort() {
        if (this.phase === 'idle') return;
        this.clearAllTimers();
        this.engine.stopRecording();
        this.phase = 'idle';
        this.plan = null;
        this.pausedFromPhase = null;
        this.emit();
    }

    reset() {
        if (this.phase !== 'done') return;
        this.phase = 'idle';
        this.plan = null;
        this.emit();
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    getSnapshot(): RunnerSnapshot {
        return this.snapshot;
    }

    // --- engine events ----------------------------------------------------

    private handleNoteEvent(event: EngineNoteEvent) {
        if (this.phase === 'armWait') {
            // Pitched sound got through the gate during the silence window
            this.rearmSilence();
            return;
        }
        if (this.phase !== 'prompting' && this.phase !== 'ringing') return;

        const fret = this.currentFret();
        if (!fret) return;

        const match = event.midi === fret.midi;
        const noteChanged =
            !this.lastNote || this.lastNote.midi !== event.midi || this.lastNote.match !== match;
        this.lastNote = { midi: event.midi, noteName: event.noteName, match };

        if (!event.isOnset) {
            // Decay frames arrive ~43/s — only re-render when the note changes
            if (noteChanged) this.emit();
            return;
        }

        if (match) {
            const sinceLast = this.now() - this.lastCountedOnsetAt;
            if (this.phase === 'ringing' && sinceLast <= ONSET_DEBOUNCE_MS) {
                if (noteChanged) this.emit();
                return; // same attack re-firing
            }
            this.consecutiveMismatch = 0;
            this.wrongStringAlert = false;
            if (this.phase === 'prompting') {
                this.countPluck();
            } else if (this.pluckPos + 1 < fret.plucks.length) {
                // Played ahead: the extra attack is the next pluck
                if (sinceLast < EARLY_REPLUCK_MS) this.paceHint = true;
                this.pluckPos++;
                this.countPluck();
            } else {
                // Fret's last pluck already counted — extra ring, extend the timer
                this.armRingTimer();
                this.emit();
            }
            return;
        }

        if ((event.midi - fret.midi) % 12 === 0) {
            // Same pitch class: octave slip (tracker glitch or wrong octave),
            // not evidence of a wrong string — excluded from the escalation
            this.addWarning('octave', `Heard ${event.noteName} — octave slip. Not counted; if it repeats, re-tune and pluck cleaner.`);
        } else {
            this.consecutiveMismatch++;
            this.addWarning('mismatch', `Heard ${event.noteName}, expected ${fret.noteName}`);
            if (this.consecutiveMismatch >= WRONG_STRING_THRESHOLD && !this.wrongStringAlert) {
                this.wrongStringAlert = true;
                this.addWarning('wrongString', 'Three wrong notes in a row — check your string and fret.');
                this.announce('Three wrong notes in a row — check your string and fret.');
            }
        }
        this.emit();
    }

    private handleSequenceCaptured(event: EngineSequenceEvent) {
        if (this.phase === 'idle' || this.phase === 'done' || this.phase === 'paused' || this.phase === 'transition') return;
        const current = this.currentString();
        if (!current || event.stringNum !== current.stringIndex) return;

        this.totalSessionSequences++;
        this.perString[this.stringPos].sequences++;

        if (this.phase === 'armWait') {
            this.addWarning('pollution', `Captured ${event.noteName} during the silence window — it IS in the dataset; note it for cleanup (protocol §5).`);
            this.emit();
            return;
        }

        const fret = this.currentFret();
        if (fret && event.midi === fret.midi) {
            this.cellSequences++;
        } else if (this.prevCell && event.midi === this.prevCell.midi && this.now() <= this.prevCell.expiresAt) {
            // Late decay slices of the previous fret — expected, not pollution
        } else {
            this.addWarning('pollution', `Captured a sequence for ${event.noteName} that wasn't prompted — it IS in the dataset; note it for cleanup (protocol §5).`);
        }
        this.emit();
    }

    // --- phase transitions --------------------------------------------------

    private enterTransition() {
        this.clearAllTimers();
        this.phase = 'transition';
        this.cellSequences = 0;
        this.pluckPos = 0;
        this.wrongStringAlert = false;
        this.consecutiveMismatch = 0;
        this.paceHint = false;
        this.lastNote = null;
        this.prevCell = null;
        this.lastTuningResetMs = this.now();
        this.countdownEndsAt = this.now() + TRANSITION_MS;
        const current = this.currentString();
        if (!current) return;
        this.announce(`String ${current.stringIndex} — ${current.stringLabel}. Re-check tuning. Press space when ready.`);
        this.transitionInterval = setInterval(() => {
            if (this.now() >= this.countdownEndsAt) {
                this.beginString();
            } else {
                this.emit();
            }
        }, COUNTDOWN_TICK_MS);
        this.emit();
    }

    private beginString() {
        const current = this.currentString();
        if (!current) return;
        this.clearAllTimers();
        // THE point of the runner: the label comes from the plan, not a click
        this.engine.startRecording(current.stringIndex);
        this.enterArmWait();
    }

    private enterArmWait() {
        this.clearAllTimers();
        this.phase = 'armWait';
        this.announce('Recording armed — silence, please.');
        this.armTimer = setTimeout(() => this.enterPrompting(true), ARM_SILENCE_MS);
        this.emit();
    }

    private rearmSilence() {
        if (this.armTimer) clearTimeout(this.armTimer);
        this.armTimer = setTimeout(() => this.enterPrompting(true), ARM_SILENCE_MS);
        const now = this.now();
        if (now - this.lastNoiseWarningAt > NOISE_WARNING_THROTTLE_MS) {
            this.lastNoiseWarningAt = now;
            this.addWarning('noise', 'Sound detected — mute the strings and keep silent.');
            this.emit();
        }
    }

    private enterPrompting(announce: boolean) {
        this.clearAllTimers();
        this.phase = 'prompting';
        const fret = this.currentFret();
        const pluck = this.currentPluck();
        if (!fret || !pluck) return;
        // Mid-fret plucks were already announced during the previous ring
        // (the prompt leads the action by one); announce on fret entry,
        // resume, and explicit skips.
        if (announce || this.pluckPos === 0) {
            this.announce(`Fret ${fret.fret} — ${speakableNote(fret.noteName)}. ${pluckPhrase(pluck)}.`);
        }
        this.armPromptTimeout();
        this.startTuningTicker();
        this.emit();
    }

    private armPromptTimeout() {
        if (this.promptTimeout) clearTimeout(this.promptTimeout);
        this.promptTimeout = setTimeout(() => {
            this.addWarning('timeout', 'Nothing detected — soft plucks can drop below the gate. Pluck harder, or skip this pluck.');
            this.announce('Nothing detected. Pluck a bit harder, or skip.');
            this.armPromptTimeout();
            this.emit();
        }, PLUCK_TIMEOUT_MS);
    }

    private countPluck() {
        this.lastCountedOnsetAt = this.now();
        this.enterRinging();
    }

    private enterRinging() {
        this.clearAllTimers();
        this.phase = 'ringing';
        const fret = this.currentFret();
        const current = this.currentString();
        if (!fret || !current) return;
        // Announce the upcoming action while the note rings
        if (this.pluckPos + 1 < fret.plucks.length) {
            this.announce(`Next: ${pluckPhrase(fret.plucks[this.pluckPos + 1])}.`);
        } else {
            const nextFret = current.frets[this.fretPos + 1];
            if (nextFret) this.announce(`Last one. Next: fret ${nextFret.fret} — ${speakableNote(nextFret.noteName)}.`);
        }
        this.armRingTimer();
        this.startTuningTicker();
        this.emit();
    }

    private armRingTimer() {
        if (this.ringTimer) clearTimeout(this.ringTimer);
        this.ringTimer = setTimeout(() => this.advancePluck(false), RING_MS);
    }

    private advancePluck(announce: boolean) {
        const fret = this.currentFret();
        if (!fret) return;
        if (this.pluckPos + 1 < fret.plucks.length) {
            this.pluckPos++;
            this.enterPrompting(announce);
        } else {
            this.advanceFret(false);
        }
    }

    private advanceFret(skipped: boolean) {
        const current = this.currentString();
        const fret = this.currentFret();
        if (!current || !fret) return;
        const progress = this.perString[this.stringPos];
        progress.fretsDone++;
        if (skipped) progress.skippedFrets.push(fret.fret);
        // Decay sequences of the old note may still arrive — expected for a bit
        this.prevCell = { midi: fret.midi, expiresAt: this.now() + PREV_CELL_GRACE_MS };
        this.cellSequences = 0;
        this.pluckPos = 0;
        this.paceHint = false;
        if (this.fretPos + 1 < current.frets.length) {
            this.fretPos++;
            this.enterPrompting(true);
        } else {
            this.advanceString();
        }
    }

    private advanceString() {
        if (!this.plan) return;
        this.engine.stopRecording();
        if (this.stringPos + 1 < this.plan.strings.length) {
            this.stringPos++;
            this.fretPos = 0;
            this.pluckPos = 0;
            this.enterTransition();
        } else {
            this.enterDone();
        }
    }

    private enterDone() {
        this.clearAllTimers();
        this.phase = 'done';
        this.announce(`Session complete — ${this.totalSessionSequences} sequences captured. Download the dataset.`);
        this.emit();
    }

    // --- helpers -----------------------------------------------------------

    private currentString(): StringTask | null {
        return this.plan?.strings[this.stringPos] ?? null;
    }

    private currentFret(): FretTask | null {
        return this.currentString()?.frets[this.fretPos] ?? null;
    }

    private currentPluck(): PluckSpec | null {
        return this.currentFret()?.plucks[this.pluckPos] ?? null;
    }

    private addWarning(kind: WarningKind, text: string) {
        this.warnings = [...this.warnings, { kind, text, atMs: this.now() }].slice(-MAX_WARNINGS);
    }

    private announce(text: string) {
        this.onAnnounce?.(text);
    }

    private startTuningTicker() {
        // The reminder only needs to surface while the operator plays; a slow
        // tick forces a re-check even if no events arrive for a while
        this.tuningTicker = setInterval(() => this.emit(), TUNING_TICK_MS);
    }

    private clearAllTimers() {
        if (this.transitionInterval) clearInterval(this.transitionInterval);
        if (this.armTimer) clearTimeout(this.armTimer);
        if (this.ringTimer) clearTimeout(this.ringTimer);
        if (this.promptTimeout) clearTimeout(this.promptTimeout);
        if (this.tuningTicker) clearInterval(this.tuningTicker);
        this.transitionInterval = null;
        this.armTimer = null;
        this.ringTimer = null;
        this.promptTimeout = null;
        this.tuningTicker = null;
    }

    private emit() {
        this.snapshot = this.buildSnapshot();
        this.listeners.forEach((listener) => listener());
    }

    private buildSnapshot(): RunnerSnapshot {
        const positioned = this.plan !== null && this.phase !== 'idle' && this.phase !== 'done';
        const currentString = positioned ? this.currentString() : null;
        const currentFret = positioned ? this.currentFret() : null;
        const active = positioned && this.phase !== 'paused' && this.phase !== 'transition';
        return {
            phase: this.phase,
            plan: this.plan,
            stringPos: this.stringPos,
            fretPos: this.fretPos,
            pluckPos: this.pluckPos,
            currentString,
            currentFret,
            currentPluck: positioned ? this.currentPluck() : null,
            countdownMs: this.phase === 'transition' ? Math.max(0, this.countdownEndsAt - this.now()) : 0,
            cellSequences: this.cellSequences,
            totalSessionSequences: this.totalSessionSequences,
            perString: this.perString.map((p) => ({ ...p, skippedFrets: [...p.skippedFrets] })),
            lastNote: this.lastNote,
            warnings: this.warnings,
            wrongStringAlert: this.wrongStringAlert,
            tuningRecheckDue: active && this.now() - this.lastTuningResetMs > TUNING_REMINDER_MS,
            paceHint: this.paceHint,
            pausedFromPhase: this.pausedFromPhase,
            startedAtMs: this.startedAtMs
        };
    }
}

export const sessionRunner = new SessionRunner(audioRecordingEngine);
