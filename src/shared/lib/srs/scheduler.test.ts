import { describe, it, expect } from 'vitest';
import {
    DAY_MS,
    DEFAULT_EASE,
    LATENCY_EASY_MS,
    LATENCY_GOOD_MS,
    MAX_EASE,
    MIN_EASE,
    createCard,
    getStrength,
    gradeFromLatency,
    isDue,
    isMastered,
    review,
    type SrsCard
} from './scheduler';

const NOW = 1_700_000_000_000;
const FAST = 900;
const STEADY = 2200;
const SLOW = 5000;

// Walks a card through a run of correct answers at one speed.
const drill = (card: SrsCard, times: number, ms: number, startAt = NOW): SrsCard => {
    let current = card;
    let clock = startAt;
    for (let i = 0; i < times; i++) {
        current = review(current, gradeFromLatency(true, ms), ms, clock);
        clock = current.due;
    }
    return current;
};

describe('createCard', () => {
    it('starts due immediately with the default ease', () => {
        const card = createCard('4>5:7', NOW);
        expect(card).toEqual({
            id: '4>5:7', ease: DEFAULT_EASE, intervalDays: 0, due: NOW, reps: 0, lapses: 0, avgMs: null
        });
        expect(isDue(card, NOW)).toBe(true);
    });
});

describe('gradeFromLatency', () => {
    it('grades correct answers by speed', () => {
        expect(gradeFromLatency(true, LATENCY_EASY_MS - 1)).toBe('EASY');
        expect(gradeFromLatency(true, LATENCY_EASY_MS)).toBe('EASY');
        expect(gradeFromLatency(true, LATENCY_EASY_MS + 1)).toBe('GOOD');
        expect(gradeFromLatency(true, LATENCY_GOOD_MS)).toBe('GOOD');
        expect(gradeFromLatency(true, LATENCY_GOOD_MS + 1)).toBe('HARD');
    });

    it('grades a wrong answer AGAIN however fast it was', () => {
        expect(gradeFromLatency(false, 50)).toBe('AGAIN');
        expect(gradeFromLatency(false, 20_000)).toBe('AGAIN');
    });
});

describe('review', () => {
    it('does not mutate the card it is given', () => {
        const card = createCard('4>5:7', NOW);
        const snapshot = { ...card };
        review(card, 'GOOD', STEADY, NOW);
        expect(card).toEqual(snapshot);
    });

    it('uses fixed steps for the first two successes, then compounds by ease', () => {
        const first = review(createCard('4>5:7', NOW), 'GOOD', STEADY, NOW);
        expect(first.intervalDays).toBe(1);
        expect(first.due).toBe(NOW + DAY_MS);
        expect(first.reps).toBe(1);

        const second = review(first, 'GOOD', STEADY, first.due);
        expect(second.intervalDays).toBe(3);
        expect(second.reps).toBe(2);

        const third = review(second, 'GOOD', STEADY, second.due);
        expect(third.intervalDays).toBeCloseTo(3 * DEFAULT_EASE, 5);
    });

    it('advances faster on EASY than GOOD, and slower on HARD', () => {
        const card = createCard('4>5:7', NOW);
        const easy = review(card, 'EASY', FAST, NOW);
        const good = review(card, 'GOOD', STEADY, NOW);
        const hard = review(card, 'HARD', SLOW, NOW);

        expect(easy.intervalDays).toBeGreaterThan(good.intervalDays);
        expect(good.intervalDays).toBeGreaterThanOrEqual(hard.intervalDays);
        expect(easy.ease).toBeGreaterThan(card.ease);
        expect(hard.ease).toBeLessThan(card.ease);
    });

    it('resets the ladder on a lapse but keeps the history', () => {
        const mature = drill(createCard('1>2:7', NOW), 4, FAST);
        expect(mature.reps).toBe(4);

        const lapsed = review(mature, 'AGAIN', 8000, mature.due);
        expect(lapsed.reps).toBe(0);
        expect(lapsed.lapses).toBe(1);
        expect(lapsed.intervalDays).toBe(0);
        expect(lapsed.due).toBe(mature.due);
        expect(lapsed.ease).toBeLessThan(mature.ease);
        // Speed history survives so one miss does not erase a fluent record.
        expect(lapsed.avgMs).toBe(mature.avgMs);
    });

    it('keeps a repeatedly lapsed card more frequent than a fresh one', () => {
        let card = createCard('2>3:7', NOW);
        for (let i = 0; i < 3; i++) card = review(card, 'AGAIN', 9000, NOW);
        expect(card.lapses).toBe(3);
        expect(card.ease).toBeLessThan(DEFAULT_EASE);

        const recovered = review(card, 'GOOD', STEADY, NOW);
        const fresh = review(createCard('4>5:7', NOW), 'GOOD', STEADY, NOW);
        // Same step now, but the damaged ease compounds more slowly from here.
        const recoveredNext = review(review(recovered, 'GOOD', STEADY, NOW), 'GOOD', STEADY, NOW);
        const freshNext = review(review(fresh, 'GOOD', STEADY, NOW), 'GOOD', STEADY, NOW);
        expect(recoveredNext.intervalDays).toBeLessThan(freshNext.intervalDays);
    });

    it('clamps ease at both ends', () => {
        let sunk = createCard('2>3:7', NOW);
        for (let i = 0; i < 20; i++) sunk = review(sunk, 'AGAIN', 9000, NOW);
        expect(sunk.ease).toBe(MIN_EASE);

        let soared = createCard('4>5:7', NOW);
        for (let i = 0; i < 30; i++) soared = review(soared, 'EASY', FAST, soared.due);
        expect(soared.ease).toBe(MAX_EASE);
    });

    it('never schedules a review in the past', () => {
        let card = createCard('4>5:7', NOW);
        for (const grade of ['GOOD', 'HARD', 'EASY', 'AGAIN', 'GOOD'] as const) {
            card = review(card, grade, STEADY, card.due);
            expect(card.due).toBeGreaterThanOrEqual(NOW);
            expect(card.intervalDays).toBeGreaterThanOrEqual(0);
        }
    });

    it('smooths response time across correct answers only', () => {
        const first = review(createCard('4>5:7', NOW), 'GOOD', 2000, NOW);
        expect(first.avgMs).toBe(2000);

        const second = review(first, 'GOOD', 1000, first.due);
        // Weighted toward history, so it lands between the two samples.
        expect(second.avgMs).toBeGreaterThan(1000);
        expect(second.avgMs).toBeLessThan(2000);

        const missed = review(second, 'AGAIN', 15_000, second.due);
        expect(missed.avgMs).toBe(second.avgMs);
    });
});

describe('getStrength', () => {
    it('is zero for a card never answered', () => {
        expect(getStrength(createCard('4>5:7', NOW))).toBe(0);
    });

    it('rises as a card is drilled', () => {
        const card = createCard('4>5:7', NOW);
        const once = drill(card, 1, FAST);
        const often = drill(card, 5, FAST);
        expect(getStrength(often)).toBeGreaterThan(getStrength(once));
        expect(getStrength(often)).toBeLessThanOrEqual(1);
    });

    it('separates a slow card from a fast one on the same schedule', () => {
        const base = drill(createCard('4>5:7', NOW), 4, FAST);
        const slow: SrsCard = { ...base, avgMs: 5800 };
        const fast: SrsCard = { ...base, avgMs: 800 };
        expect(getStrength(fast)).toBeGreaterThan(getStrength(slow));
    });

    it('stays within 0..1 for extreme values', () => {
        const absurd: SrsCard = { id: 'x', ease: 2.5, intervalDays: 5000, due: NOW, reps: 40, lapses: 0, avgMs: 1 };
        expect(getStrength(absurd)).toBeLessThanOrEqual(1);
        const dreadful: SrsCard = { id: 'x', ease: 1.3, intervalDays: 0, due: NOW, reps: 1, lapses: 9, avgMs: 60_000 };
        expect(getStrength(dreadful)).toBeGreaterThanOrEqual(0);
    });
});

describe('isMastered', () => {
    it('requires speed as well as a mature schedule', () => {
        const drilled = drill(createCard('4>5:7', NOW), 4, FAST);
        expect(isMastered(drilled)).toBe(true);

        // Same schedule, but answered slowly every time: derived, not known.
        expect(isMastered({ ...drilled, avgMs: 4000 })).toBe(false);
    });

    it('rejects a single lucky fast answer', () => {
        expect(isMastered(drill(createCard('4>5:7', NOW), 1, FAST))).toBe(false);
    });

    it('rejects a card that has never been answered', () => {
        expect(isMastered(createCard('4>5:7', NOW))).toBe(false);
    });
});
