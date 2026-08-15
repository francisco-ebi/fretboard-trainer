import type { SrsCard } from './scheduler';

/**
 * Review history persistence.
 *
 * Cards live under a tuning context key (see makeContextKey) so a retune or an
 * instrument switch never grades progress against a geometry it was not learned
 * on. Everything is namespaced under one localStorage entry to keep the key
 * surface small and make a version bump a single delete.
 */

export const STORAGE_KEY = 'fretboard-srs-v1';
const STORAGE_VERSION = 1;

interface SrsStore {
    version: number;
    contexts: Record<string, Record<string, SrsCard>>;
}

const emptyStore = (): SrsStore => ({ version: STORAGE_VERSION, contexts: {} });

const isCard = (value: unknown): value is SrsCard => {
    if (typeof value !== 'object' || value === null) return false;
    const card = value as Partial<SrsCard>;
    return typeof card.id === 'string' &&
        typeof card.ease === 'number' &&
        typeof card.intervalDays === 'number' &&
        typeof card.due === 'number' &&
        typeof card.reps === 'number' &&
        typeof card.lapses === 'number' &&
        (card.avgMs === null || typeof card.avgMs === 'number');
};

const readStore = (): SrsStore => {
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(STORAGE_KEY);
    } catch {
        // Private-mode Safari throws on access rather than returning null.
        return emptyStore();
    }
    if (!raw) return emptyStore();

    try {
        const parsed = JSON.parse(raw) as Partial<SrsStore>;
        // A future version is not readable; start clean rather than misinterpret
        // fields. Older versions get migrated here when there is one to migrate.
        if (parsed.version !== STORAGE_VERSION || typeof parsed.contexts !== 'object' || parsed.contexts === null) {
            return emptyStore();
        }
        return { version: STORAGE_VERSION, contexts: parsed.contexts as SrsStore['contexts'] };
    } catch (e) {
        console.error('Failed to parse SRS store from localStorage', e);
        return emptyStore();
    }
};

const writeStore = (store: SrsStore): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
        // Quota or private mode: practice keeps working, only history is lost.
        console.error('Failed to persist SRS store', e);
    }
};

/** Every stored card for a tuning context, dropping entries that fail validation. */
export const loadCards = (contextKey: string): Record<string, SrsCard> => {
    const stored = readStore().contexts[contextKey];
    if (!stored) return {};

    const cards: Record<string, SrsCard> = {};
    for (const [id, value] of Object.entries(stored)) {
        if (isCard(value)) cards[id] = value;
    }
    return cards;
};

export const saveCards = (contextKey: string, cards: Record<string, SrsCard>): void => {
    const store = readStore();
    store.contexts[contextKey] = cards;
    writeStore(store);
};

/** Merges one reviewed card without rewriting the rest of the context. */
export const saveCard = (contextKey: string, card: SrsCard): void => {
    const store = readStore();
    store.contexts[contextKey] = { ...store.contexts[contextKey], [card.id]: card };
    writeStore(store);
};

export const clearContext = (contextKey: string): void => {
    const store = readStore();
    delete store.contexts[contextKey];
    writeStore(store);
};

export const clearAll = (): void => {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.error('Failed to clear SRS store', e);
    }
};
