import { describe, it, expect } from 'vitest';
import {
    STAGES,
    enumerateMoves,
    getOpenStringPitches,
    moveId,
    type MoveSpec
} from '@/shared/lib/music/fretboardMoves';
import {
    DEFAULT_SESSION_CONFIG,
    createSession,
    generateQuestion,
    isAnswerCorrect,
    isSessionComplete,
    selectSessionItems,
    submitAnswer,
    takeNext,
    type SessionState
} from './deck';
import { createCard, review, type SrsCard } from './scheduler';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;
const MAX_FRET = 18;

const GUITAR = getOpenStringPitches('GUITAR', 6);
const MOVES = enumerateMoves(GUITAR, { intervals: STAGES.PENTATONIC, skips: [1] });
const MOVES_BY_ID = new Map<string, MoveSpec>(MOVES.map(m => [moveId(m), m]));
const DECK_IDS = MOVES.map(moveId);

// Deterministic rng: always the first playable option.
const firstOption = () => 0;

const cardsFrom = (entries: Array<[string, Partial<SrsCard>]>): Record<string, SrsCard> =>
    Object.fromEntries(entries.map(([id, patch]) => [id, { ...createCard(id, NOW), ...patch }]));

describe('selectSessionItems', () => {
    it('returns new items when nothing has been reviewed, capped by maxNew', () => {
        const items = selectSessionItems({}, DECK_IDS, NOW);
        expect(items).toHaveLength(DEFAULT_SESSION_CONFIG.maxNew);
        for (const id of items) expect(DECK_IDS).toContain(id);
    });

    it('puts due cards before new ones, oldest first', () => {
        const [a, b, c] = DECK_IDS;
        const cards = cardsFrom([
            [a, { due: NOW - DAY }],
            [b, { due: NOW - 3 * DAY }],
            [c, { due: NOW + DAY }]   // not due yet
        ]);

        const items = selectSessionItems(cards, DECK_IDS, NOW);
        expect(items[0]).toBe(b);
        expect(items[1]).toBe(a);
        expect(items).not.toContain(c);
    });

    it('excludes cards scheduled for the future', () => {
        const cards = cardsFrom(DECK_IDS.map(id => [id, { due: NOW + DAY }] as [string, Partial<SrsCard>]));
        expect(selectSessionItems(cards, DECK_IDS, NOW)).toEqual([]);
    });

    it('honours maxItems even when everything is due', () => {
        const cards = cardsFrom(DECK_IDS.map(id => [id, { due: NOW - DAY }] as [string, Partial<SrsCard>]));
        const items = selectSessionItems(cards, DECK_IDS, NOW, { ...DEFAULT_SESSION_CONFIG, maxItems: 7 });
        expect(items).toHaveLength(7);
    });

    it('leaves no room for new items when reviews already fill the session', () => {
        const due = DECK_IDS.slice(0, 5);
        const cards = cardsFrom(due.map(id => [id, { due: NOW - DAY }] as [string, Partial<SrsCard>]));
        const items = selectSessionItems(cards, DECK_IDS, NOW, { maxItems: 5, maxNew: 4, lapseRequeueGap: 5 });
        expect(items).toHaveLength(5);
        expect(items.every(id => due.includes(id))).toBe(true);
    });

    it('is stable across calls with identical input', () => {
        const cards = cardsFrom(DECK_IDS.slice(0, 6).map(id => [id, { due: NOW - DAY }] as [string, Partial<SrsCard>]));
        expect(selectSessionItems(cards, DECK_IDS, NOW)).toEqual(selectSessionItems(cards, DECK_IDS, NOW));
    });
});

describe('generateQuestion', () => {
    const move = MOVES_BY_ID.get('4>5:7')!; // string 5 -> string 6, the 5th

    it('lands the target on the destination string', () => {
        const q = generateQuestion('4>5:7', move, { stringIndex: 4, fret: 12 }, MAX_FRET, firstOption)!;
        expect(q.anchor).toEqual({ stringIndex: 4, fret: 12 });
        expect(q.target).toEqual({ stringIndex: 5, fret: 12 });
    });

    it('reuses the given anchor when the move can start there', () => {
        const q = generateQuestion('4>5:7', move, { stringIndex: 4, fret: 7 }, MAX_FRET, firstOption)!;
        expect(q.anchor.fret).toBe(7);
    });

    it('picks a fresh anchor when the given one is on another string', () => {
        const q = generateQuestion('4>5:7', move, { stringIndex: 1, fret: 7 }, MAX_FRET, firstOption)!;
        expect(q.anchor.stringIndex).toBe(4);
    });

    it('picks a fresh anchor when the move would run off the neck', () => {
        const back3 = MOVES_BY_ID.get('0>1:4')!; // string 1 -> string 2, major third, delta -3
        expect(back3.delta).toBe(-3);
        const q = generateQuestion('0>1:4', back3, { stringIndex: 0, fret: 1 }, MAX_FRET, firstOption)!;
        expect(q.anchor.fret).toBeGreaterThanOrEqual(3);
        expect(q.target.fret).toBeGreaterThanOrEqual(0);
    });

    it('always produces an on-board question for every move in the deck', () => {
        for (const [id, move] of MOVES_BY_ID) {
            for (const roll of [0, 0.5, 0.999]) {
                const q = generateQuestion(id, move, null, MAX_FRET, () => roll);
                expect(q).not.toBeNull();
                expect(q!.anchor.fret).toBeGreaterThanOrEqual(0);
                expect(q!.anchor.fret).toBeLessThanOrEqual(MAX_FRET);
                expect(q!.target.fret).toBeGreaterThanOrEqual(0);
                expect(q!.target.fret).toBeLessThanOrEqual(MAX_FRET);
            }
        }
    });

    it('returns null when the neck is too short for the move', () => {
        expect(generateQuestion('x', { from: 0, to: 1, delta: -8, interval: 3 }, null, 6, firstOption)).toBeNull();
    });
});

describe('isAnswerCorrect', () => {
    const question = generateQuestion('4>5:7', MOVES_BY_ID.get('4>5:7')!, { stringIndex: 4, fret: 9 }, MAX_FRET)!;

    it('accepts the exact target', () => {
        expect(isAnswerCorrect(question, { stringIndex: 5, fret: 9 })).toBe(true);
    });

    it('rejects the right pitch class on the wrong string', () => {
        // The same note exists elsewhere, but the item being drilled is this crossing.
        expect(isAnswerCorrect(question, { stringIndex: 4, fret: 14 })).toBe(false);
    });

    it('rejects a neighbouring fret', () => {
        expect(isAnswerCorrect(question, { stringIndex: 5, fret: 10 })).toBe(false);
    });
});

describe('takeNext', () => {
    it('returns null once the queue is empty', () => {
        expect(takeNext(createSession([]), MOVES_BY_ID, MAX_FRET, firstOption)).toBeNull();
    });

    it('chains: prefers a move departing from where the learner stands', () => {
        // Queue head starts on string 1; a later item starts on string 6.
        const session: SessionState = { ...createSession(['0>1:7', '5>4:7']), anchor: { stringIndex: 5, fret: 5 } };
        const next = takeNext(session, MOVES_BY_ID, MAX_FRET, firstOption)!;
        expect(next.question.itemId).toBe('5>4:7');
        expect(next.question.anchor).toEqual({ stringIndex: 5, fret: 5 });
    });

    it('falls back to the queue head and re-anchors when nothing chains', () => {
        const session: SessionState = { ...createSession(['0>1:7', '1>2:7']), anchor: { stringIndex: 5, fret: 5 } };
        const next = takeNext(session, MOVES_BY_ID, MAX_FRET, firstOption)!;
        expect(next.question.itemId).toBe('0>1:7');
        expect(next.question.anchor.stringIndex).toBe(0);
    });

    it('moves the chosen item to the front of the queue', () => {
        const session: SessionState = { ...createSession(['0>1:7', '5>4:7']), anchor: { stringIndex: 5, fret: 5 } };
        const next = takeNext(session, MOVES_BY_ID, MAX_FRET, firstOption)!;
        expect(next.state.queue[0]).toBe('5>4:7');
        expect(next.state.queue).toHaveLength(2);
    });

    it('drops ids that are no longer in the deck instead of stalling', () => {
        const session = createSession(['gone:99', '4>5:7']);
        const next = takeNext(session, MOVES_BY_ID, MAX_FRET, firstOption)!;
        expect(next.question.itemId).toBe('4>5:7');
        expect(next.state.queue).not.toContain('gone:99');
    });

    it('returns null when every queued id is unknown', () => {
        expect(takeNext(createSession(['a:1', 'b:2']), MOVES_BY_ID, MAX_FRET, firstOption)).toBeNull();
    });
});

describe('submitAnswer', () => {
    const startSession = (ids: string[], anchor: SessionState['anchor'] = null): SessionState =>
        ({ ...createSession(ids), anchor });

    it('leaves the learner standing on the target after a correct answer', () => {
        const session = startSession(['4>5:7', '1>2:7']);
        const { question, state } = takeNext(session, MOVES_BY_ID, MAX_FRET, firstOption)!;
        const after = submitAnswer(state, question, true);

        expect(after.anchor).toEqual(question.target);
        expect(after.correct).toBe(1);
        expect(after.asked).toBe(1);
        expect(after.queue).not.toContain(question.itemId);
    });

    it('clears the anchor after a miss so the next question re-anchors', () => {
        const session = startSession(['4>5:7', '1>2:7', '2>3:7']);
        const { question, state } = takeNext(session, MOVES_BY_ID, MAX_FRET, firstOption)!;
        const after = submitAnswer(state, question, false);

        expect(after.anchor).toBeNull();
        expect(after.correct).toBe(0);
        expect(after.asked).toBe(1);
    });

    it('re-queues a missed item further down rather than immediately', () => {
        const ids = ['4>5:7', '1>2:7', '2>3:7', '3>4:7', '0>1:7', '5>4:7', '4>3:7'];
        const session = startSession(ids);
        const { question, state } = takeNext(session, MOVES_BY_ID, MAX_FRET, firstOption)!;
        const after = submitAnswer(state, question, false, { ...DEFAULT_SESSION_CONFIG, lapseRequeueGap: 3 });

        expect(after.queue).toContain(question.itemId);
        expect(after.queue.indexOf(question.itemId)).toBe(3);
        expect(after.queue).toHaveLength(ids.length);
    });

    it('re-queues at the end when fewer items remain than the gap', () => {
        const session = startSession(['4>5:7', '1>2:7']);
        const { question, state } = takeNext(session, MOVES_BY_ID, MAX_FRET, firstOption)!;
        const after = submitAnswer(state, question, false, { ...DEFAULT_SESSION_CONFIG, lapseRequeueGap: 10 });
        expect(after.queue[after.queue.length - 1]).toBe(question.itemId);
    });

    it('tracks streak and best streak', () => {
        let state = startSession(['4>5:7', '1>2:7', '2>3:7', '3>4:7']);
        for (const correct of [true, true, false, true]) {
            const next = takeNext(state, MOVES_BY_ID, MAX_FRET, firstOption)!;
            state = submitAnswer(next.state, next.question, correct);
        }
        expect(state.bestStreak).toBe(2);
        expect(state.streak).toBe(1);
    });

    it('records a missed item once, not per miss', () => {
        let state = startSession(['4>5:7', '1>2:7']);
        for (let i = 0; i < 3; i++) {
            const next = takeNext(state, MOVES_BY_ID, MAX_FRET, firstOption)!;
            if (next.question.itemId === '4>5:7') {
                state = submitAnswer(next.state, next.question, false);
            } else {
                state = submitAnswer(next.state, next.question, true);
            }
        }
        expect(state.missed.filter(id => id === '4>5:7')).toHaveLength(1);
    });
});

describe('session loop', () => {
    it('drains when everything is answered correctly', () => {
        let state = createSession(DECK_IDS.slice(0, 8));
        let guard = 0;

        while (!isSessionComplete(state) && guard++ < 100) {
            const next = takeNext(state, MOVES_BY_ID, MAX_FRET, firstOption)!;
            state = submitAnswer(next.state, next.question, true);
        }

        expect(isSessionComplete(state)).toBe(true);
        expect(state.asked).toBe(8);
        expect(state.correct).toBe(8);
        expect(state.bestStreak).toBe(8);
    });

    it('drains even when the first attempt at every item is wrong', () => {
        let state = createSession(DECK_IDS.slice(0, 6));
        const failedOnce = new Set<string>();
        let guard = 0;

        while (!isSessionComplete(state) && guard++ < 200) {
            const next = takeNext(state, MOVES_BY_ID, MAX_FRET, firstOption)!;
            const id = next.question.itemId;
            const correct = failedOnce.has(id);
            failedOnce.add(id);
            state = submitAnswer(next.state, next.question, correct);
        }

        expect(isSessionComplete(state)).toBe(true);
        expect(state.asked).toBe(12); // each item missed once, then answered
        expect(state.missed).toHaveLength(6);
    });

    it('never asks a question the learner cannot reach on the board', () => {
        let state = createSession(DECK_IDS.slice(0, 20));
        let guard = 0;

        while (!isSessionComplete(state) && guard++ < 200) {
            const next = takeNext(state, MOVES_BY_ID, MAX_FRET, () => Math.random())!;
            const { anchor, target } = next.question;
            expect(anchor.fret).toBeGreaterThanOrEqual(0);
            expect(anchor.fret).toBeLessThanOrEqual(MAX_FRET);
            expect(target.fret).toBeGreaterThanOrEqual(0);
            expect(target.fret).toBeLessThanOrEqual(MAX_FRET);
            expect(anchor.stringIndex).toBe(next.question.move.from);
            expect(target.stringIndex).toBe(next.question.move.to);
            state = submitAnswer(next.state, next.question, true);
        }
        expect(isSessionComplete(state)).toBe(true);
    });

    it('feeds reviews back into the scheduler so the next session is smaller', () => {
        const cards: Record<string, SrsCard> = {};
        let state = createSession(selectSessionItems(cards, DECK_IDS, NOW));
        let guard = 0;

        while (!isSessionComplete(state) && guard++ < 100) {
            const next = takeNext(state, MOVES_BY_ID, MAX_FRET, firstOption)!;
            const id = next.question.itemId;
            cards[id] = review(cards[id] ?? createCard(id, NOW), 'GOOD', 1200, NOW);
            state = submitAnswer(next.state, next.question, true);
        }

        // Everything just answered is scheduled for tomorrow, so today's second
        // session only offers the next batch of new material.
        const later = selectSessionItems(cards, DECK_IDS, NOW + 60_000);
        expect(later.every(id => !(id in cards))).toBe(true);
        expect(later).toHaveLength(DEFAULT_SESSION_CONFIG.maxNew);
    });
});
