import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { STORAGE_KEY, clearAll, clearContext, loadCards, saveCard, saveCards } from './storage';
import { createCard, review, type SrsCard } from './scheduler';

const NOW = 1_700_000_000_000;
const GUITAR = 'GUITAR-6';
const DROP_D = 'GUITAR-6-0.0.0.0.0.-2';

describe('srs storage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns an empty map when nothing is stored', () => {
        expect(loadCards(GUITAR)).toEqual({});
    });

    it('round-trips reviewed cards', () => {
        const card = review(createCard('4>5:7', NOW), 'GOOD', 1200, NOW);
        saveCards(GUITAR, { [card.id]: card });
        expect(loadCards(GUITAR)).toEqual({ '4>5:7': card });
    });

    it('merges a single card without disturbing the rest', () => {
        const first = review(createCard('4>5:7', NOW), 'GOOD', 1200, NOW);
        const second = review(createCard('1>2:7', NOW), 'HARD', 5200, NOW);
        saveCards(GUITAR, { [first.id]: first });
        saveCard(GUITAR, second);

        const loaded = loadCards(GUITAR);
        expect(Object.keys(loaded).sort()).toEqual(['1>2:7', '4>5:7']);
        expect(loaded['4>5:7']).toEqual(first);
    });

    it('keeps tuning contexts separate', () => {
        // The same id means a different move after a retune, so progress must
        // not carry across.
        const standard = review(createCard('4>5:7', NOW), 'EASY', 900, NOW);
        const dropped = review(createCard('4>5:7', NOW), 'AGAIN', 9000, NOW);
        saveCard(GUITAR, standard);
        saveCard(DROP_D, dropped);

        expect(loadCards(GUITAR)['4>5:7']).toEqual(standard);
        expect(loadCards(DROP_D)['4>5:7']).toEqual(dropped);
    });

    it('clears one context and leaves the others', () => {
        saveCard(GUITAR, createCard('4>5:7', NOW));
        saveCard(DROP_D, createCard('4>5:7', NOW));
        clearContext(GUITAR);

        expect(loadCards(GUITAR)).toEqual({});
        expect(Object.keys(loadCards(DROP_D))).toEqual(['4>5:7']);
    });

    it('clears everything', () => {
        saveCard(GUITAR, createCard('4>5:7', NOW));
        clearAll();
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
        expect(loadCards(GUITAR)).toEqual({});
    });

    it('recovers from a corrupt payload instead of throwing', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        localStorage.setItem(STORAGE_KEY, '{not json');
        expect(loadCards(GUITAR)).toEqual({});
        expect(error).toHaveBeenCalled();
    });

    it('discards a store written by a newer version rather than misreading it', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: 99,
            contexts: { [GUITAR]: { '4>5:7': createCard('4>5:7', NOW) } }
        }));
        expect(loadCards(GUITAR)).toEqual({});
    });

    it('drops entries that are not well-formed cards', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: 1,
            contexts: {
                [GUITAR]: {
                    '4>5:7': createCard('4>5:7', NOW),
                    '1>2:7': { id: '1>2:7', ease: 'lots' },
                    '2>3:7': null
                }
            }
        }));
        expect(Object.keys(loadCards(GUITAR))).toEqual(['4>5:7']);
    });

    it('accepts a card whose avgMs is still null', () => {
        const fresh = createCard('4>5:7', NOW);
        expect(fresh.avgMs).toBeNull();
        saveCard(GUITAR, fresh);
        expect(loadCards(GUITAR)['4>5:7']).toEqual(fresh);
    });

    it('survives a write failure without throwing', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('QuotaExceededError');
        });
        expect(() => saveCard(GUITAR, createCard('4>5:7', NOW))).not.toThrow();
        expect(error).toHaveBeenCalled();
    });

    it('survives a read failure without throwing', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('SecurityError');
        });
        expect(loadCards(GUITAR)).toEqual({});
    });

    it('persists a full review history unchanged through several sessions', () => {
        let card: SrsCard = createCard('4>5:7', NOW);
        for (const grade of ['GOOD', 'EASY', 'AGAIN', 'GOOD', 'HARD'] as const) {
            card = review(card, grade, 1800, card.due);
            saveCard(GUITAR, card);
        }
        expect(loadCards(GUITAR)['4>5:7']).toEqual(card);
    });
});
