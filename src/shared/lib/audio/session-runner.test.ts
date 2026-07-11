import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    SessionRunner,
    TRANSITION_MS,
    ARM_SILENCE_MS,
    RING_MS,
    ONSET_DEBOUNCE_MS,
    PLUCK_TIMEOUT_MS,
    PREV_CELL_GRACE_MS,
    type RunnerEngine
} from './session-runner';
import { generateSessionPlan, type SessionPlan } from './session-plan';
import type { EngineNoteEvent, EngineSequenceEvent } from './recording-engine';

const makeEngine = () => ({
    startRecording: vi.fn<(stringIndex: number) => void>(),
    stopRecording: vi.fn<() => void>(),
    onNoteEvent: null as ((event: EngineNoteEvent) => void) | null,
    onSequenceCaptured: null as ((event: EngineSequenceEvent) => void) | null
});

// String 5 (low E), frets 0–1: unique zone → 2 plucks per fret
const smallPlan = () => generateSessionPlan({ preset: 'single', stringIndex: 5, fretStart: 0, fretEnd: 1 });

// Two strings × one fret each — for string-transition tests
const twoStringPlan = (): SessionPlan => {
    const a = generateSessionPlan({ preset: 'single', stringIndex: 5, fretStart: 0, fretEnd: 0 });
    const b = generateSessionPlan({ preset: 'single', stringIndex: 4, fretStart: 0, fretEnd: 0 });
    return {
        preset: 'single',
        strings: [...a.strings, ...b.strings],
        totalPlucks: a.totalPlucks + b.totalPlucks
    };
};

const fireNote = (engine: RunnerEngine, midi: number, overrides: Partial<EngineNoteEvent> = {}) => {
    engine.onNoteEvent?.({
        midi,
        noteName: `midi${midi}`,
        isOnset: true,
        accepted: true,
        rms: 0.2,
        pitchConfidence: 0.9,
        ...overrides
    });
};

const fireSeq = (engine: RunnerEngine, midi: number, stringNum: number) => {
    engine.onSequenceCaptured?.({
        midi,
        noteName: `midi${midi}`,
        stringNum,
        isOnsetAnchored: true,
        datasetLength: 1
    });
};

describe('session runner', () => {
    let engine: ReturnType<typeof makeEngine>;
    let runner: SessionRunner;

    beforeEach(() => {
        vi.useFakeTimers();
        engine = makeEngine();
        runner = new SessionRunner(engine);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('walks transition → armWait → prompting on timers and sets the label itself', () => {
        runner.start(smallPlan());
        expect(runner.getSnapshot().phase).toBe('transition');
        expect(engine.startRecording).not.toHaveBeenCalled();

        vi.advanceTimersByTime(TRANSITION_MS);
        expect(engine.startRecording).toHaveBeenCalledWith(5);
        expect(runner.getSnapshot().phase).toBe('armWait');

        vi.advanceTimersByTime(ARM_SILENCE_MS);
        expect(runner.getSnapshot().phase).toBe('prompting');
        expect(runner.getSnapshot().currentFret?.fret).toBe(0);
    });

    it('confirmReady skips the countdown', () => {
        runner.start(smallPlan());
        runner.confirmReady();
        expect(engine.startRecording).toHaveBeenCalledWith(5);
        expect(runner.getSnapshot().phase).toBe('armWait');
    });

    it('re-arms the silence window when noise gets through the gate', () => {
        runner.start(smallPlan());
        runner.confirmReady();

        vi.advanceTimersByTime(1000);
        fireNote(engine, 45); // pitched noise mid-window
        vi.advanceTimersByTime(1500); // would have finished the original window
        expect(runner.getSnapshot().phase).toBe('armWait');
        expect(runner.getSnapshot().warnings.some((w) => w.kind === 'noise')).toBe(true);

        vi.advanceTimersByTime(ARM_SILENCE_MS - 1500);
        expect(runner.getSnapshot().phase).toBe('prompting');
    });

    it('counts a matching onset, rings, and advances pluck → fret → done', () => {
        runner.start(smallPlan());
        runner.confirmReady();
        vi.advanceTimersByTime(ARM_SILENCE_MS);

        fireNote(engine, 40); // E2, expected on fret 0
        expect(runner.getSnapshot().phase).toBe('ringing');

        vi.advanceTimersByTime(RING_MS);
        expect(runner.getSnapshot().phase).toBe('prompting');
        expect(runner.getSnapshot().pluckPos).toBe(1);

        fireNote(engine, 40); // second (last) pluck of fret 0
        vi.advanceTimersByTime(RING_MS);
        expect(runner.getSnapshot().currentFret?.fret).toBe(1);
        expect(runner.getSnapshot().pluckPos).toBe(0);

        fireNote(engine, 41); // F2 on fret 1
        vi.advanceTimersByTime(RING_MS);
        fireNote(engine, 41);
        vi.advanceTimersByTime(RING_MS);
        expect(runner.getSnapshot().phase).toBe('done');
        expect(engine.stopRecording).toHaveBeenCalled();
    });

    it('escalates three consecutive mismatches to a wrong-string alert and clears it on a match', () => {
        runner.start(smallPlan());
        runner.confirmReady();
        vi.advanceTimersByTime(ARM_SILENCE_MS);

        fireNote(engine, 45);
        fireNote(engine, 45);
        expect(runner.getSnapshot().wrongStringAlert).toBe(false);
        fireNote(engine, 45);
        expect(runner.getSnapshot().wrongStringAlert).toBe(true);
        expect(runner.getSnapshot().phase).toBe('prompting'); // never advanced

        fireNote(engine, 40);
        expect(runner.getSnapshot().wrongStringAlert).toBe(false);
        expect(runner.getSnapshot().phase).toBe('ringing');
    });

    it('treats octave slips as tracker glitches, not wrong-string evidence', () => {
        runner.start(smallPlan());
        runner.confirmReady();
        vi.advanceTimersByTime(ARM_SILENCE_MS);

        fireNote(engine, 52); // E3 = expected + 12
        fireNote(engine, 52);
        fireNote(engine, 52);
        const snapshot = runner.getSnapshot();
        expect(snapshot.warnings.some((w) => w.kind === 'octave')).toBe(true);
        expect(snapshot.wrongStringAlert).toBe(false);
        expect(snapshot.phase).toBe('prompting');
    });

    it('warns on a silent prompt without advancing (soft plucks drop below the gate)', () => {
        runner.start(smallPlan());
        runner.confirmReady();
        vi.advanceTimersByTime(ARM_SILENCE_MS);

        vi.advanceTimersByTime(PLUCK_TIMEOUT_MS);
        const snapshot = runner.getSnapshot();
        expect(snapshot.phase).toBe('prompting');
        expect(snapshot.pluckPos).toBe(0);
        expect(snapshot.warnings.some((w) => w.kind === 'timeout')).toBe(true);
    });

    it('counts play-ahead onsets during the ring, with a pace hint when too early', () => {
        runner.start(smallPlan());
        runner.confirmReady();
        vi.advanceTimersByTime(ARM_SILENCE_MS);

        fireNote(engine, 40);
        expect(runner.getSnapshot().phase).toBe('ringing');

        // Within the debounce window: same attack, ignored
        vi.advanceTimersByTime(ONSET_DEBOUNCE_MS - 50);
        fireNote(engine, 40);
        expect(runner.getSnapshot().pluckPos).toBe(0);

        // Past debounce but early: counted as the next pluck + pace hint
        vi.advanceTimersByTime(500);
        fireNote(engine, 40);
        const snapshot = runner.getSnapshot();
        expect(snapshot.pluckPos).toBe(1);
        expect(snapshot.phase).toBe('ringing');
        expect(snapshot.paceHint).toBe(true);
    });

    it('attributes sequences to the current cell, honors the previous-fret grace, flags pollution', () => {
        runner.start(smallPlan());
        runner.confirmReady();
        vi.advanceTimersByTime(ARM_SILENCE_MS);

        fireSeq(engine, 40, 5);
        expect(runner.getSnapshot().cellSequences).toBe(1);
        expect(runner.getSnapshot().totalSessionSequences).toBe(1);

        // Advance to fret 1: late E2 decay slices still count without warning
        runner.skipFret();
        expect(runner.getSnapshot().cellSequences).toBe(0);
        fireSeq(engine, 40, 5);
        expect(runner.getSnapshot().totalSessionSequences).toBe(2);
        expect(runner.getSnapshot().warnings.some((w) => w.kind === 'pollution')).toBe(false);

        // After the grace window an unprompted note is pollution
        vi.advanceTimersByTime(PREV_CELL_GRACE_MS + 1);
        fireSeq(engine, 40, 5);
        expect(runner.getSnapshot().warnings.some((w) => w.kind === 'pollution')).toBe(true);

        // Sequences saved under another label are ignored
        fireSeq(engine, 45, 4);
        expect(runner.getSnapshot().totalSessionSequences).toBe(3);
    });

    it('pause stops the engine; resume restarts the same string and re-arms silence at the same spot', () => {
        runner.start(smallPlan());
        runner.confirmReady();
        vi.advanceTimersByTime(ARM_SILENCE_MS);
        fireNote(engine, 40);
        vi.advanceTimersByTime(RING_MS); // now prompting pluck 1

        runner.pause();
        expect(engine.stopRecording).toHaveBeenCalledTimes(1);
        expect(runner.getSnapshot().phase).toBe('paused');

        runner.resume();
        expect(engine.startRecording).toHaveBeenCalledTimes(2);
        expect(engine.startRecording).toHaveBeenLastCalledWith(5);
        expect(runner.getSnapshot().phase).toBe('armWait');

        vi.advanceTimersByTime(ARM_SILENCE_MS);
        const snapshot = runner.getSnapshot();
        expect(snapshot.phase).toBe('prompting');
        expect(snapshot.pluckPos).toBe(1); // same spot
    });

    it('pause during the transition restarts the countdown on resume', () => {
        runner.start(smallPlan());
        vi.advanceTimersByTime(TRANSITION_MS / 2);
        runner.pause();
        runner.resume();
        expect(runner.getSnapshot().phase).toBe('transition');
        vi.advanceTimersByTime(TRANSITION_MS - 1000);
        expect(runner.getSnapshot().phase).toBe('transition'); // fresh countdown, not the old remainder
        vi.advanceTimersByTime(1000);
        expect(runner.getSnapshot().phase).toBe('armWait');
    });

    it('records skipped frets and moves between strings through a transition', () => {
        runner.start(twoStringPlan());
        runner.confirmReady();
        vi.advanceTimersByTime(ARM_SILENCE_MS);

        runner.skipFret(); // only fret of string 5 → advances to string 4
        expect(runner.getSnapshot().perString[0].skippedFrets).toEqual([0]);
        expect(engine.stopRecording).toHaveBeenCalledTimes(1);
        expect(runner.getSnapshot().phase).toBe('transition');
        expect(runner.getSnapshot().currentString?.stringIndex).toBe(4);

        vi.advanceTimersByTime(TRANSITION_MS);
        expect(engine.startRecording).toHaveBeenLastCalledWith(4);
    });

    it('skipString jumps to the next string, and the last one ends the session', () => {
        runner.start(twoStringPlan());
        runner.confirmReady();
        vi.advanceTimersByTime(ARM_SILENCE_MS);

        runner.skipString();
        expect(runner.getSnapshot().phase).toBe('transition');
        runner.skipString();
        expect(runner.getSnapshot().phase).toBe('done');
    });

    it('abort returns to idle and kills all timers', () => {
        runner.start(smallPlan());
        runner.confirmReady();
        vi.advanceTimersByTime(ARM_SILENCE_MS);

        runner.abort();
        expect(runner.getSnapshot().phase).toBe('idle');
        expect(engine.stopRecording).toHaveBeenCalled();

        const callsBefore = engine.startRecording.mock.calls.length;
        vi.advanceTimersByTime(10 * PLUCK_TIMEOUT_MS);
        expect(engine.startRecording.mock.calls.length).toBe(callsBefore);
        expect(runner.getSnapshot().phase).toBe('idle');
    });

    it('replaces the snapshot object on every state change (external-store contract)', () => {
        runner.start(smallPlan());
        const first = runner.getSnapshot();
        runner.confirmReady();
        const second = runner.getSnapshot();
        expect(second).not.toBe(first);
        expect(runner.getSnapshot()).toBe(second); // stable between changes
    });

    it('announces strings, frets and variations through the speech hook', () => {
        const spoken: string[] = [];
        runner.onAnnounce = (text) => spoken.push(text);

        runner.start(smallPlan());
        expect(spoken[0]).toContain('String 5 — low E');

        runner.confirmReady();
        vi.advanceTimersByTime(ARM_SILENCE_MS);
        expect(spoken.some((t) => t.startsWith('Fret 0'))).toBe(true);

        fireNote(engine, 40);
        expect(spoken.some((t) => t.startsWith('Next:'))).toBe(true);
    });
});
