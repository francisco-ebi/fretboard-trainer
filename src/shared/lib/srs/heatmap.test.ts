import { describe, it, expect } from 'vitest';
import { buildStrengthIndex, getCellStrength } from './heatmap';
import { createCard, review, type SrsCard } from './scheduler';

const NOW = 1_700_000_000_000;
const FAST = 900;
const SLOW = 5000;

// Walks a card through `times` correct answers at one speed.
const drill = (id: string, times: number, ms: number): SrsCard => {
    let card = createCard(id, NOW);
    let clock = NOW;
    for (let i = 0; i < times; i++) {
        card = review(card, ms <= 1500 ? 'EASY' : 'HARD', ms, clock);
        clock = card.due;
    }
    return card;
};

describe('buildStrengthIndex', () => {
    it('is empty for no cards', () => {
        expect(buildStrengthIndex({})).toEqual(new Map());
    });

    it('reads a single card by its destination string and interval', () => {
        const card = drill('4>5:7', 4, FAST); // string 5 -> string 6, the 5th
        const index = buildStrengthIndex({ [card.id]: card });

        expect(getCellStrength(index, 5, 7)).toBeGreaterThan(0);
        // Not the origin string, and not a different interval.
        expect(getCellStrength(index, 4, 7)).toBe(0);
        expect(getCellStrength(index, 5, 4)).toBe(0);
    });

    it('averages every move landing on the same string and interval', () => {
        const strong = drill('0>1:7', 4, FAST);  // fast, well known
        const weak = drill('2>1:7', 1, SLOW);    // one slow answer

        const index = buildStrengthIndex({ [strong.id]: strong, [weak.id]: weak });
        const combined = getCellStrength(index, 1, 7);

        // Both land on string 1 with the same interval, so the cell reads their
        // average, strictly between the two individual strengths.
        const soloStrong = getCellStrength(buildStrengthIndex({ [strong.id]: strong }), 1, 7);
        const soloWeak = getCellStrength(buildStrengthIndex({ [weak.id]: weak }), 1, 7);
        expect(soloWeak).toBeLessThan(soloStrong);
        expect(combined).toBeGreaterThan(soloWeak);
        expect(combined).toBeLessThan(soloStrong);
        expect(combined).toBeCloseTo((soloStrong + soloWeak) / 2, 6);
    });

    it('keeps moves with the same interval on different strings apart', () => {
        const onString1 = drill('0>1:7', 4, FAST);
        const onString5 = drill('4>5:7', 4, FAST);

        const index = buildStrengthIndex({ [onString1.id]: onString1, [onString5.id]: onString5 });
        expect(getCellStrength(index, 1, 7)).toBeCloseTo(getCellStrength(index, 5, 7), 6);
        expect(getCellStrength(index, 1, 7)).toBeGreaterThan(0);
        // No move landed on string 3 at all.
        expect(getCellStrength(index, 3, 7)).toBe(0);
    });

    it('ignores malformed ids instead of throwing', () => {
        const good = drill('0>1:7', 4, FAST);
        const bogus: SrsCard = { ...createCard('not-a-move-id', NOW), reps: 1 };

        expect(() => buildStrengthIndex({ [good.id]: good, [bogus.id]: bogus })).not.toThrow();
        const index = buildStrengthIndex({ [good.id]: good, [bogus.id]: bogus });
        expect(getCellStrength(index, 1, 7)).toBeGreaterThan(0);
    });

    it('reflects an unreviewed card as zero strength, same as no card at all', () => {
        const fresh = createCard('0>1:7', NOW);
        const index = buildStrengthIndex({ [fresh.id]: fresh });
        expect(getCellStrength(index, 1, 7)).toBe(0);
    });
});

describe('getCellStrength', () => {
    it('returns 0 for a cell absent from the index', () => {
        expect(getCellStrength(new Map(), 0, 0)).toBe(0);
    });
});
