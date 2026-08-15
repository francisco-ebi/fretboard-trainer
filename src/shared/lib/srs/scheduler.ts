/**
 * Spaced repetition for fretboard moves.
 *
 * An SM-2 variant with two departures from flashcard scheduling, both forced by
 * what is being learned:
 *
 * 1. Grading is automatic. A tap is objectively right or wrong and the app
 *    times it, so there is no "how well did you know it?" button. Latency *is*
 *    the signal: fretboard knowledge that takes four seconds is useless mid
 *    phrase, so a slow correct answer is deliberately treated as weak.
 *
 * 2. Day-scale intervals only decide which items enter a session. Re-drilling
 *    inside a session is the session queue's job (see deck.ts) — a scheduler
 *    that answers "in 4 days" would end a practice session after a dozen taps.
 */

export type Grade = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';

export interface SrsCard {
    id: string;
    /** SM-2 ease factor; higher = intervals grow faster. */
    ease: number;
    intervalDays: number;
    /** Epoch ms when the card next becomes eligible. */
    due: number;
    /** Consecutive successful reviews; reset by a lapse. */
    reps: number;
    lapses: number;
    /** Smoothed response time over correct answers, ms. Null until first success. */
    avgMs: number | null;
}

export const DAY_MS = 86_400_000;

// Latency bands. A tap under EASY is recall; over GOOD the learner is deriving
// the answer rather than knowing it, which is why that still loses ease.
export const LATENCY_EASY_MS = 1500;
export const LATENCY_GOOD_MS = 3000;
/** Beyond this a correct answer contributes nothing to the strength score. */
export const LATENCY_FLOOR_MS = 6000;

export const MIN_EASE = 1.3;
export const MAX_EASE = 2.8;
export const DEFAULT_EASE = 2.5;

const EASE_PENALTY_AGAIN = 0.2;
const EASE_PENALTY_HARD = 0.15;
const EASE_BONUS_EASY = 0.05;

// Weight on the newest sample when folding response time into avgMs. Low enough
// that one unlucky tap does not erase a fluent history.
const LATENCY_SMOOTHING = 0.3;

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

export const createCard = (id: string, now: number): SrsCard => ({
    id,
    ease: DEFAULT_EASE,
    intervalDays: 0,
    due: now,
    reps: 0,
    lapses: 0,
    avgMs: null
});

/** Maps an answer to a grade. Wrong is always AGAIN, however fast it was. */
export const gradeFromLatency = (correct: boolean, responseMs: number): Grade => {
    if (!correct) return 'AGAIN';
    if (responseMs <= LATENCY_EASY_MS) return 'EASY';
    if (responseMs <= LATENCY_GOOD_MS) return 'GOOD';
    return 'HARD';
};

const nextInterval = (card: SrsCard, grade: Grade, ease: number): number => {
    // The first two successes use fixed steps; compounding by ease from an
    // interval of 0 would never leave day one.
    const rep = card.reps + 1;
    switch (grade) {
        case 'AGAIN':
            return 0;
        case 'HARD':
            return rep === 1 ? 1 : Math.max(1, card.intervalDays * 1.2);
        case 'GOOD':
            if (rep === 1) return 1;
            if (rep === 2) return 3;
            return card.intervalDays * ease;
        case 'EASY':
            if (rep === 1) return 2;
            if (rep === 2) return 5;
            return card.intervalDays * ease * 1.3;
    }
};

/**
 * Applies one review. Pure: returns a new card, never mutates.
 *
 * Note that no rule here singles out the hard string crossings (the B/G pair on
 * a guitar). It does not need to — those items accumulate lapses and lose ease
 * on their own, so the scheduler surfaces them more often by ordinary means.
 */
export const review = (card: SrsCard, grade: Grade, responseMs: number, now: number): SrsCard => {
    let ease = card.ease;
    if (grade === 'AGAIN') ease -= EASE_PENALTY_AGAIN;
    else if (grade === 'HARD') ease -= EASE_PENALTY_HARD;
    else if (grade === 'EASY') ease += EASE_BONUS_EASY;
    ease = clamp(ease, MIN_EASE, MAX_EASE);

    const intervalDays = nextInterval(card, grade, ease);

    // A lapse restarts the ladder but keeps ease and history, so a card that
    // has failed repeatedly stays permanently more frequent than a fresh one.
    const reps = grade === 'AGAIN' ? 0 : card.reps + 1;
    const lapses = grade === 'AGAIN' ? card.lapses + 1 : card.lapses;

    const avgMs = grade === 'AGAIN'
        ? card.avgMs
        : card.avgMs === null
            ? responseMs
            : card.avgMs * (1 - LATENCY_SMOOTHING) + responseMs * LATENCY_SMOOTHING;

    return {
        id: card.id,
        ease,
        intervalDays,
        due: now + intervalDays * DAY_MS,
        reps,
        lapses,
        avgMs
    };
};

export const isDue = (card: SrsCard, now: number): boolean => card.due <= now;

/**
 * How well the move is known, 0..1 — the value a fretboard heat map paints.
 * Deliberately blends schedule maturity with speed so a card that is merely
 * *scheduled* far out but answered slowly does not read as mastered.
 */
export const getStrength = (card: SrsCard): number => {
    if (card.reps === 0) return 0;

    const scheduleScore = clamp(card.intervalDays / 21, 0, 1);
    const speedScore = card.avgMs === null
        ? 0
        : clamp(
            (LATENCY_FLOOR_MS - card.avgMs) / (LATENCY_FLOOR_MS - LATENCY_EASY_MS),
            0,
            1
        );

    return clamp(scheduleScore * 0.6 + speedScore * 0.4, 0, 1);
};

/** Known cold: fast, and held across separated sessions rather than one lucky run. */
export const isMastered = (card: SrsCard): boolean =>
    card.reps >= 3 &&
    card.intervalDays >= 3 &&
    card.avgMs !== null &&
    card.avgMs <= LATENCY_EASY_MS;
