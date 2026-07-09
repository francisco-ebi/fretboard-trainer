import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SEQUENCE_LENGTH, NUM_FEATURES } from './dataset-preparation';
import type { DatasetEntry } from './recording-engine';

// In-memory stand-in for the IndexedDB store, keyed like autoIncrement.
// State lives in vi.hoisted so each test can wipe it: the mock factory result
// is cached across tests even when vi.resetModules() re-creates the engine.
const mockStore = vi.hoisted(() => ({
    rows: new Map<number, unknown>(),
    nextKey: 1,
    reset() {
        this.rows.clear();
        this.nextKey = 1;
    }
}));

vi.mock('./dataset-autosave', () => ({
    appendAutosaved: vi.fn(async (entries: unknown[]) => {
        for (const entry of entries) mockStore.rows.set(mockStore.nextKey++, entry);
    }),
    maxAutosavedKey: vi.fn(async () => (mockStore.rows.size ? Math.max(...mockStore.rows.keys()) : 0)),
    countAutosavedUpTo: vi.fn(async (key: number) => [...mockStore.rows.keys()].filter(k => k <= key).length),
    readAutosavedUpTo: vi.fn(async (key: number) =>
        [...mockStore.rows.entries()].filter(([k]) => k <= key).sort(([a], [b]) => a - b).map(([, v]) => v)
    ),
    clearAutosavedUpTo: vi.fn(async (key: number) => {
        for (const k of [...mockStore.rows.keys()]) if (k <= key) mockStore.rows.delete(k);
    }),
    clearAutosavedAbove: vi.fn(async (key: number) => {
        for (const k of [...mockStore.rows.keys()]) if (k > key) mockStore.rows.delete(k);
    })
}));

const frame = (fill: number) => new Array(NUM_FEATURES).fill(fill);
const entry = (midiNote: number, fill = 0.5): DatasetEntry => ({
    midiNote,
    stringNum: 2,
    noteName: 'G3',
    features: Array.from({ length: SEQUENCE_LENGTH }, () => frame(fill)),
    normalizedFeatures: []
});

// Fresh module registry per test: new engine singleton + empty mock store
beforeEach(() => {
    vi.resetModules();
    mockStore.reset();
    vi.stubGlobal('URL', Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:mock'),
        revokeObjectURL: vi.fn()
    }));
});

const loadModules = async () => {
    const autosave = await import('./dataset-autosave');
    return { autosave };
};

const loadEngine = async () => (await import('./recording-engine')).audioRecordingEngine;

const storeContents = async () => {
    const { readAutosavedUpTo } = await import('./dataset-autosave');
    return readAutosavedUpTo(Number.MAX_SAFE_INTEGER) as Promise<DatasetEntry[]>;
};

describe('recording engine dataset autosave', () => {
    it('mirrors imported sequences into the autosave', async () => {
        const engine = await loadEngine();
        engine.importDataset([entry(55), entry(57)]);
        await vi.waitFor(async () => expect(await storeContents()).toHaveLength(2));
    });

    it('reports and restores only the previous session rows', async () => {
        const { autosave } = await loadModules();
        await autosave.appendAutosaved([entry(40, 0.1), entry(45, 0.2)]); // previous session
        const engine = await loadEngine(); // boundary = 2

        engine.importDataset([entry(64, 0.9)]); // this session, already in memory
        await vi.waitFor(async () => expect(await storeContents()).toHaveLength(3));

        expect(await engine.getPendingAutosaveCount()).toBe(2);
        const total = await engine.restoreAutosave();
        expect(total).toBe(3); // 1 imported + 2 restored, no duplicates
        expect(engine.dataset.map(e => e.midiNote).sort()).toEqual([40, 45, 64]);
        expect(await engine.getPendingAutosaveCount()).toBe(0);
    });

    it('does not append twice on a second restore call', async () => {
        const { autosave } = await loadModules();
        await autosave.appendAutosaved([entry(40)]);
        const engine = await loadEngine();

        expect(await engine.restoreAutosave()).toBe(1);
        expect(await engine.restoreAutosave()).toBe(1);
    });

    it('download clears only this session rows while a previous autosave is pending', async () => {
        const { autosave } = await loadModules();
        await autosave.appendAutosaved([entry(40, 0.1)]); // pending previous session
        const engine = await loadEngine();

        engine.importDataset([entry(64, 0.9)]);
        await vi.waitFor(async () => expect(await storeContents()).toHaveLength(2));

        await engine.downloadDataset();
        const kept = await storeContents();
        expect(kept).toHaveLength(1);
        expect(kept[0].midiNote).toBe(40); // previous session row survived
        expect(await engine.getPendingAutosaveCount()).toBe(1);
    });

    it('download clears everything once the previous autosave was restored', async () => {
        const { autosave } = await loadModules();
        await autosave.appendAutosaved([entry(40)]);
        const engine = await loadEngine();

        await engine.restoreAutosave();
        engine.importDataset([entry(64)]);
        await engine.downloadDataset();

        expect(await storeContents()).toHaveLength(0);
    });

    it('discard removes only the previous session rows and keeps this session mirrored', async () => {
        const { autosave } = await loadModules();
        await autosave.appendAutosaved([entry(40, 0.1), entry(45, 0.2)]);
        const engine = await loadEngine();

        engine.importDataset([entry(64, 0.9)]);
        await vi.waitFor(async () => expect(await storeContents()).toHaveLength(3));

        await engine.discardAutosave();
        const kept = await storeContents();
        expect(kept).toHaveLength(1);
        expect(kept[0].midiNote).toBe(64);
        expect(await engine.getPendingAutosaveCount()).toBe(0);
        expect(engine.dataset.map(e => e.midiNote)).toEqual([64]); // memory untouched
    });

    it('restore rejects corrupt rows and stays pending', async () => {
        const { autosave } = await loadModules();
        await autosave.appendAutosaved([{ midiNote: 40, stringNum: 2, noteName: 'E2', features: [[1, 2]] }]);
        const engine = await loadEngine();

        await expect(engine.restoreAutosave()).rejects.toThrow(/frames/);
        expect(engine.dataset).toHaveLength(0);
        expect(await engine.getPendingAutosaveCount()).toBe(1); // discard remains possible
    });
});
