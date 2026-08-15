import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Fretboard, { FRETS } from '@/widgets/Fretboard';
import BottomSheet from '@/widgets/BottomSheet';
import { useInstrument, useNaming } from '@/app/providers';
import { useIsMobile } from '@/shared/lib/hooks/useMediaQuery';
import { type PracticeCellState } from '@/entities/note';
import {
    getIntervalBySemitones,
    getNoteAtPosition,
    getNoteName
} from '@/shared/lib/music/musicTheory';
import {
    STAGES,
    STAGE_ORDER,
    type Anchor,
    type MoveSpec,
    type StageId,
    enumerateMoves,
    getOpenStringPitches,
    makeContextKey,
    moveId
} from '@/shared/lib/music/fretboardMoves';
import {
    type Question,
    type SessionState,
    createSession,
    isAnswerCorrect,
    isSessionComplete,
    selectSessionItems,
    submitAnswer,
    takeNext
} from '@/shared/lib/srs/deck';
import { createCard, gradeFromLatency, review, type SrsCard } from '@/shared/lib/srs/scheduler';
import { loadCards, saveCard } from '@/shared/lib/srs/storage';
import './ui.css';

interface PracticeModeProps {
    isFullScreen?: boolean;
}

// Crossing more than four strings stops being a shape anyone reaches for, so the
// skip picker tops out there however many strings the instrument has.
const MAX_SKIP = 4;

// How long a correct answer stays lit before the next question. Long enough to
// register, short enough that a good run keeps its rhythm.
const CORRECT_ADVANCE_MS = 650;

const cellKey = (anchor: Anchor): string => `${anchor.stringIndex}-${anchor.fret}`;

/**
 * Everything belonging to one run through a deck. Kept as a single state object
 * so switching decks is one atomic swap — a session, its question and its
 * review history can never be left describing different decks.
 */
interface PracticeRun {
    /** Deck this run belongs to; a mismatch triggers a rebuild. */
    signature: string;
    session: SessionState;
    question: Question | null;
    feedback: { correct: boolean; tapped: Anchor } | null;
    cards: Record<string, SrsCard>;
}

const buildRun = (
    signature: string,
    deckIds: string[],
    movesById: Map<string, MoveSpec>,
    contextKey: string,
    ignoreDue: boolean
): PracticeRun => {
    const cards = loadCards(contextKey);
    const items = ignoreDue ? deckIds : selectSessionItems(cards, deckIds, Date.now());
    const fresh = createSession(items);
    const next = takeNext(fresh, movesById, FRETS);

    return {
        signature,
        session: next ? next.state : fresh,
        question: next ? next.question : null,
        feedback: null,
        cards
    };
};

const readStoredSkips = (): number[] => {
    const stored = localStorage.getItem('practice-skips');
    if (!stored) return [1];
    try {
        const parsed = JSON.parse(stored) as unknown;
        if (!Array.isArray(parsed)) return [1];
        const skips = parsed.filter((n): n is number => typeof n === 'number' && n >= 1);
        return skips.length > 0 ? skips : [1];
    } catch {
        return [1];
    }
};

const PracticeMode: React.FC<PracticeModeProps> = ({ isFullScreen = false }) => {
    const { t } = useTranslation();
    const { namingSystem } = useNaming();
    const { instrument, stringCount, tuningOffsets } = useInstrument();
    const isMobile = useIsMobile();

    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [stage, setStageState] = useState<StageId>(
        () => (localStorage.getItem('practice-stage') as StageId) || 'ROOT_AND_FIFTH'
    );
    const [skips, setSkipsState] = useState<number[]>(readStoredSkips);

    const setStage = (next: StageId) => {
        setStageState(next);
        localStorage.setItem('practice-stage', next);
    };

    const setSkips = (next: number[]) => {
        // Never leave the deck empty; the last selected skip stays on.
        if (next.length === 0) return;
        const sorted = [...next].sort((a, b) => a - b);
        setSkipsState(sorted);
        localStorage.setItem('practice-skips', JSON.stringify(sorted));
    };

    const pitches = useMemo(
        () => getOpenStringPitches(instrument, stringCount, tuningOffsets),
        [instrument, stringCount, tuningOffsets]
    );
    const contextKey = useMemo(
        () => makeContextKey(instrument, stringCount, tuningOffsets),
        [instrument, stringCount, tuningOffsets]
    );
    const moves = useMemo(
        () => enumerateMoves(pitches, { intervals: STAGES[stage], skips }),
        [pitches, stage, skips]
    );
    const movesById = useMemo(
        () => new Map<string, MoveSpec>(moves.map(move => [moveId(move), move])),
        [moves]
    );
    const deckIds = useMemo(() => moves.map(moveId), [moves]);

    // Covers every input the deck is built from: contextKey folds in the
    // instrument, string count and tuning.
    const deckSignature = `${contextKey}|${stage}|${skips.join(',')}`;
    const [run, setRun] = useState<PracticeRun>(
        () => buildRun(deckSignature, deckIds, movesById, contextKey, false)
    );

    // Changing stage, skips, instrument or tuning starts a new session. Done
    // during render rather than in an effect so the board never paints a
    // question from the deck the learner just navigated away from.
    if (run.signature !== deckSignature) {
        setRun(buildRun(deckSignature, deckIds, movesById, contextKey, false));
    }

    const { session, question, feedback } = run;

    // Timed from paint, not from the state update, so latency reflects when the
    // learner could actually see the question.
    const askedAtRef = useRef(0);
    useEffect(() => { askedAtRef.current = performance.now(); }, [question]);

    const handleCellClick = useCallback((stringIndex: number, fret: number) => {
        setRun(prev => {
            if (!prev.question || prev.feedback) return prev;

            const tapped: Anchor = { stringIndex, fret };
            const correct = isAnswerCorrect(prev.question, tapped);
            const responseMs = performance.now() - askedAtRef.current;
            const now = Date.now();

            const card = prev.cards[prev.question.itemId] ?? createCard(prev.question.itemId, now);
            const reviewed = review(card, gradeFromLatency(correct, responseMs), responseMs, now);
            saveCard(contextKey, reviewed);

            return {
                ...prev,
                feedback: { correct, tapped },
                cards: { ...prev.cards, [reviewed.id]: reviewed }
            };
        });
    }, [contextKey]);

    const advance = useCallback(() => {
        setRun(prev => {
            if (!prev.question || !prev.feedback) return prev;

            const nextState = submitAnswer(prev.session, prev.question, prev.feedback.correct);
            const next = takeNext(nextState, movesById, FRETS);

            return {
                ...prev,
                session: next ? next.state : nextState,
                question: next ? next.question : null,
                feedback: null
            };
        });
    }, [movesById]);

    // A correct answer flows on by itself. A miss waits for the learner to
    // acknowledge it — they need time to look at where the note actually was.
    useEffect(() => {
        if (!feedback?.correct) return;
        const timer = setTimeout(advance, CORRECT_ADVANCE_MS);
        return () => clearTimeout(timer);
    }, [feedback, advance]);

    const startSession = useCallback((ignoreDue: boolean) => {
        setRun(buildRun(deckSignature, deckIds, movesById, contextKey, ignoreDue));
    }, [deckSignature, deckIds, movesById, contextKey]);

    const cellStates = useMemo(() => {
        const states = new Map<string, PracticeCellState>();
        if (!question) return states;

        // Every fret on the destination string is answerable; the question is
        // which one. Anchor is written after, and cannot collide (skip >= 1).
        for (let fret = 0; fret <= FRETS; fret++) {
            states.set(`${question.move.to}-${fret}`, 'CANDIDATE');
        }
        states.set(cellKey(question.anchor), 'ANCHOR');

        if (feedback) {
            if (!feedback.correct) states.set(cellKey(question.target), 'REVEAL');
            states.set(cellKey(feedback.tapped), feedback.correct ? 'CORRECT' : 'WRONG');
        }
        return states;
    }, [question, feedback]);

    const anchorNote = question
        ? getNoteAtPosition(instrument, question.anchor.stringIndex, question.anchor.fret, tuningOffsets, stringCount)
        : 'C';

    const intervalLabel = useCallback((interval: number): string => (
        interval === 0
            ? t('practice.sameNote')
            : t(`intervals.${getIntervalBySemitones(interval).key}`)
    ), [t]);

    const complete = isSessionComplete(session) && !question;
    const emptyDeck = complete && session.asked === 0;

    const total = session.asked + session.queue.length;
    const accuracy = session.asked > 0
        ? Math.round((session.correct / session.asked) * 100)
        : 0;

    const availableSkips = useMemo(() => {
        const highest = Math.min(MAX_SKIP, stringCount - 1);
        return Array.from({ length: highest }, (_, i) => i + 1);
    }, [stringCount]);

    const toggleSkip = (skip: number) => {
        setSkips(skips.includes(skip) ? skips.filter(s => s !== skip) : [...skips, skip]);
    };

    const settings = (
        <div className="practice-settings">
            <div className="practice-setting-group">
                <label className="practice-setting-label" htmlFor="practice-stage">
                    {t('practice.stage')}
                </label>
                <select
                    id="practice-stage"
                    className="practice-select"
                    value={stage}
                    onChange={e => setStage(e.target.value as StageId)}
                >
                    {STAGE_ORDER.map(id => (
                        <option key={id} value={id}>{t(`practice.stages.${id}`)}</option>
                    ))}
                </select>
            </div>

            <div className="practice-setting-group">
                <span className="practice-setting-label">{t('practice.stringSkip')}</span>
                <div className="practice-chip-row">
                    {availableSkips.map(skip => (
                        <button
                            key={skip}
                            className={`practice-chip ${skips.includes(skip) ? 'active' : ''}`}
                            onClick={() => toggleSkip(skip)}
                            aria-pressed={skips.includes(skip)}
                        >
                            {t('practice.skipN', { count: skip })}
                        </button>
                    ))}
                </div>
                <p className="practice-setting-hint">{t('practice.stringSkipHint')}</p>
            </div>

            <div className="practice-setting-group">
                <span className="practice-setting-label">{t('practice.deckSize')}</span>
                <span className="practice-deck-size">
                    {t('practice.deckSizeValue', { count: moves.length })}
                </span>
            </div>
        </div>
    );

    const prompt = question && (
        <div className={`practice-prompt ${feedback ? (feedback.correct ? 'correct' : 'wrong') : ''}`}>
            <div className="practice-prompt-main">
                <span className="practice-prompt-from">
                    {getNoteName(anchorNote, namingSystem)}
                </span>
                <span className="practice-prompt-arrow" aria-hidden="true">→</span>
                <span className="practice-prompt-interval">
                    {intervalLabel(question.move.interval)}
                </span>
            </div>
            <div className="practice-prompt-target">
                {t('practice.onString', { string: question.move.to + 1 })}
            </div>
        </div>
    );

    const stats = (
        <div className="practice-stats">
            <div className="practice-stat">
                <span className="practice-stat-value">{session.asked}/{total}</span>
                <span className="practice-stat-label">{t('practice.progress')}</span>
            </div>
            <div className="practice-stat">
                <span className="practice-stat-value">
                    {session.streak > 0 ? `🔥 ${session.streak}` : '—'}
                </span>
                <span className="practice-stat-label">{t('practice.streak')}</span>
            </div>
            <div className="practice-stat">
                <span className="practice-stat-value">{session.asked > 0 ? `${accuracy}%` : '—'}</span>
                <span className="practice-stat-label">{t('practice.accuracy')}</span>
            </div>
        </div>
    );

    const feedbackBar = feedback && !feedback.correct && (
        <div className="practice-feedback">
            <span className="practice-feedback-text">{t('practice.missed')}</span>
            <button className="practice-continue-btn" onClick={advance} autoFocus>
                {t('practice.continue')}
            </button>
        </div>
    );

    const summary = complete && (
        <div className="practice-summary">
            {emptyDeck ? (
                <>
                    <h2 className="practice-summary-title">{t('practice.allCaughtUp')}</h2>
                    <p className="practice-summary-note">{t('practice.allCaughtUpNote')}</p>
                    <button className="practice-primary-btn" onClick={() => startSession(true)}>
                        {t('practice.reviewAhead')}
                    </button>
                </>
            ) : (
                <>
                    <h2 className="practice-summary-title">{t('practice.sessionComplete')}</h2>
                    <div className="practice-summary-grid">
                        <div className="practice-stat">
                            <span className="practice-stat-value">{accuracy}%</span>
                            <span className="practice-stat-label">{t('practice.accuracy')}</span>
                        </div>
                        <div className="practice-stat">
                            <span className="practice-stat-value">{session.bestStreak}</span>
                            <span className="practice-stat-label">{t('practice.bestStreak')}</span>
                        </div>
                        <div className="practice-stat">
                            <span className="practice-stat-value">{session.missed.length}</span>
                            <span className="practice-stat-label">{t('practice.toRevisit')}</span>
                        </div>
                    </div>
                    {session.missed.length > 0 && (
                        <ul className="practice-missed-list">
                            {session.missed.map(id => {
                                const move = movesById.get(id);
                                if (!move) return null;
                                return (
                                    <li key={id}>
                                        {intervalLabel(move.interval)}
                                        {' · '}
                                        {t('practice.stringToString', {
                                            from: move.from + 1,
                                            to: move.to + 1
                                        })}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <button className="practice-primary-btn" onClick={() => startSession(true)}>
                        {t('practice.practiceAgain')}
                    </button>
                </>
            )}
        </div>
    );

    // With no question left there is nothing to answer, and an empty board
    // would push the summary off screen.
    const board = complete ? null : (
        <div className="fretboard-wrapper">
            <Fretboard
                selectedRoot={anchorNote}
                scaleNotes={[]}
                characteristicInterval={undefined}
                instrument={instrument}
                tuningOffsets={tuningOffsets}
                stringCount={stringCount}
                namingSystem={namingSystem}
                practice={{
                    cellStates,
                    onCellClick: handleCellClick,
                    locked: !!feedback
                }}
            />
        </div>
    );

    if (isMobile && !isFullScreen) {
        return (
            <div className="practice-mode mobile-stage">
                {prompt}
                {/* Streak is the feedback that carries the session, so it stays
                    on screen rather than living behind the sheet. */}
                {stats}
                {board}
                {feedbackBar}
                {summary}

                <BottomSheet
                    title={t(`practice.stages.${stage}`)}
                    open={isSheetOpen}
                    onOpenChange={setIsSheetOpen}
                >
                    {settings}
                </BottomSheet>
            </div>
        );
    }

    return (
        <div className={`practice-mode ${isFullScreen ? 'fullscreen' : ''}`}>
            {!isFullScreen && settings}
            {stats}
            {prompt}
            {board}
            {feedbackBar}
            {summary}
        </div>
    );
};

export default PracticeMode;
