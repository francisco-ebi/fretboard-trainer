import {
    type Anchor,
    type MoveSpec,
    isPlayableFrom,
    playableAnchorFrets,
    targetOf
} from '@/shared/lib/music/fretboardMoves';
import { isDue, type SrsCard } from './scheduler';

/**
 * Session assembly and the in-session queue.
 *
 * The session is a traversal: each correct answer leaves the learner standing
 * on the note they just found, and the next move departs from there. Errors
 * break the chain — the correct position is revealed and the next question
 * re-anchors somewhere fresh, so a wrong guess cannot cascade into a run of
 * questions asked from the wrong place.
 */

export interface Question {
    itemId: string;
    move: MoveSpec;
    anchor: Anchor;
    /** The position a correct answer lands on. */
    target: Anchor;
}

export interface SessionConfig {
    /** Total questions before the session ends. */
    maxItems: number;
    /** Cap on unseen moves introduced in one session. */
    maxNew: number;
    /** How many questions later a missed item comes back. */
    lapseRequeueGap: number;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
    maxItems: 20,
    maxNew: 4,
    lapseRequeueGap: 5
};

export interface SessionState {
    /** Item ids still to ask; index 0 is next. */
    queue: string[];
    /** Where the learner currently stands. Null forces a fresh anchor. */
    anchor: Anchor | null;
    asked: number;
    correct: number;
    streak: number;
    bestStreak: number;
    /** Items missed at least once this session. */
    missed: string[];
}

/**
 * Which moves to practise now: everything due, oldest first, then new moves up
 * to the cap.
 *
 * The new-item cap is the single most important guard here. Introducing
 * unlimited new moves feels productive on day one and buries the learner in
 * reviews by day four.
 */
export const selectSessionItems = (
    cards: Record<string, SrsCard>,
    deckIds: string[],
    now: number,
    config: SessionConfig = DEFAULT_SESSION_CONFIG
): string[] => {
    const due: SrsCard[] = [];
    const fresh: string[] = [];

    for (const id of deckIds) {
        const card = cards[id];
        if (!card) fresh.push(id);
        else if (isDue(card, now)) due.push(card);
    }

    // Oldest due first; id breaks ties so a session is reproducible.
    due.sort((a, b) => (a.due - b.due) || a.id.localeCompare(b.id));

    const selected = due.map(card => card.id).slice(0, config.maxItems);
    const room = Math.min(config.maxNew, config.maxItems - selected.length);
    return room > 0 ? [...selected, ...fresh.slice(0, room)] : selected;
};

export const createSession = (items: string[]): SessionState => ({
    queue: [...items],
    anchor: null,
    asked: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    missed: []
});

export const isSessionComplete = (state: SessionState): boolean => state.queue.length === 0;

const randomFrom = <T,>(values: T[], rng: () => number): T =>
    values[Math.min(values.length - 1, Math.floor(rng() * values.length))];

/**
 * Builds a question for one move, reusing `anchor` when the chain can continue
 * from it and picking a random playable anchor otherwise.
 *
 * Returns null only when the move cannot fit on the neck at all, which needs a
 * board shorter than the displacement — findDelta normalises to (-6, 6], so any
 * realistic fret count always has playable anchors.
 */
export const generateQuestion = (
    itemId: string,
    move: MoveSpec,
    anchor: Anchor | null,
    maxFret: number,
    rng: () => number = Math.random
): Question | null => {
    let origin: Anchor;

    if (anchor && isPlayableFrom(anchor, move, maxFret)) {
        origin = anchor;
    } else {
        const options = playableAnchorFrets(move, maxFret);
        if (options.length === 0) return null;
        origin = { stringIndex: move.from, fret: randomFrom(options, rng) };
    }

    return { itemId, move, anchor: origin, target: targetOf(origin, move) };
};

/**
 * Pulls the next question, preferring an item that departs from where the
 * learner is standing so the session reads as a walk across the neck rather
 * than a shuffle of unrelated positions. Falls back to the queue head, which
 * re-anchors.
 */
export const takeNext = (
    state: SessionState,
    movesById: Map<string, MoveSpec>,
    maxFret: number,
    rng: () => number = Math.random
): { question: Question; state: SessionState } | null => {
    if (state.queue.length === 0) return null;

    let index = 0;
    if (state.anchor) {
        const chainable = state.queue.findIndex(id => {
            const move = movesById.get(id);
            return !!move && isPlayableFrom(state.anchor as Anchor, move, maxFret);
        });
        if (chainable !== -1) index = chainable;
    }

    const itemId = state.queue[index];
    const move = movesById.get(itemId);
    // An id with no move means the deck options changed under a stored session;
    // drop it rather than stalling the queue.
    if (!move) {
        const queue = state.queue.filter((_, i) => i !== index);
        return takeNext({ ...state, queue }, movesById, maxFret, rng);
    }

    const question = generateQuestion(itemId, move, state.anchor, maxFret, rng);
    if (!question) {
        const queue = state.queue.filter((_, i) => i !== index);
        return takeNext({ ...state, queue }, movesById, maxFret, rng);
    }

    // Rotate the chosen item to the front so submitAnswer can assume index 0.
    const queue = [itemId, ...state.queue.filter((_, i) => i !== index)];
    return { question, state: { ...state, queue, anchor: question.anchor } };
};

export const isAnswerCorrect = (question: Question, tapped: Anchor): boolean =>
    tapped.stringIndex === question.target.stringIndex && tapped.fret === question.target.fret;

/**
 * Records an answer and advances the queue.
 *
 * A miss re-queues the item a few questions later — the within-session loop
 * that day-scale intervals cannot provide — and clears the anchor so the next
 * question starts somewhere known-good.
 */
export const submitAnswer = (
    state: SessionState,
    question: Question,
    correct: boolean,
    config: SessionConfig = DEFAULT_SESSION_CONFIG
): SessionState => {
    const remaining = state.queue.filter(id => id !== question.itemId);

    if (correct) {
        const streak = state.streak + 1;
        return {
            ...state,
            queue: remaining,
            anchor: question.target,
            asked: state.asked + 1,
            correct: state.correct + 1,
            streak,
            bestStreak: Math.max(state.bestStreak, streak)
        };
    }

    const at = Math.min(config.lapseRequeueGap, remaining.length);
    return {
        ...state,
        queue: [...remaining.slice(0, at), question.itemId, ...remaining.slice(at)],
        anchor: null,
        asked: state.asked + 1,
        streak: 0,
        missed: state.missed.includes(question.itemId) ? state.missed : [...state.missed, question.itemId]
    };
};
