// Crash-safety net for recording sessions: every captured or imported
// sequence is mirrored into IndexedDB and a successful download clears the
// mirrored rows. The store therefore always holds exactly the sequences that
// exist nowhere else yet — after a reload the Recording Studio offers to
// restore them.
//
// Rows get monotonic autoIncrement keys, which lets the engine distinguish
// "rows from a previous session" (key <= boundary observed at startup) from
// "rows this session already holds in memory" (key > boundary). All
// operations are best-effort: environments without IndexedDB (jsdom, some
// private-browsing modes) degrade to no-ops so recording itself never breaks.
// Not designed for two studio tabs recording concurrently.

const DB_NAME = 'fretboard-recording-autosave';
const DB_VERSION = 1;
const STORE = 'sequences';

const hasIndexedDb = () => typeof indexedDB !== 'undefined';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(STORE)) {
                    request.result.createObjectStore(STORE, { autoIncrement: true });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
        });
        dbPromise.catch(() => { dbPromise = null; }); // allow retry after a failed open
    }
    return dbPromise;
}

function transactionDone(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
}

export async function appendAutosaved(entries: unknown[]): Promise<void> {
    if (!hasIndexedDb() || entries.length === 0) return;
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const entry of entries) store.add(entry);
    await transactionDone(tx);
}

// Highest key currently in the store (0 when empty) — the session boundary.
export async function maxAutosavedKey(): Promise<number> {
    if (!hasIndexedDb()) return 0;
    const db = await openDb();
    const cursor = await requestResult(
        db.transaction(STORE, 'readonly').objectStore(STORE).openKeyCursor(null, 'prev')
    );
    return cursor ? Number(cursor.key) : 0;
}

export async function countAutosavedUpTo(key: number): Promise<number> {
    if (!hasIndexedDb() || key <= 0) return 0;
    const db = await openDb();
    return requestResult(
        db.transaction(STORE, 'readonly').objectStore(STORE).count(IDBKeyRange.upperBound(key))
    );
}

export async function readAutosavedUpTo(key: number): Promise<unknown[]> {
    if (!hasIndexedDb() || key <= 0) return [];
    const db = await openDb();
    return requestResult(
        db.transaction(STORE, 'readonly').objectStore(STORE).getAll(IDBKeyRange.upperBound(key))
    );
}

export async function clearAutosavedUpTo(key: number): Promise<void> {
    if (!hasIndexedDb() || key <= 0) return;
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(IDBKeyRange.upperBound(key));
    await transactionDone(tx);
}

// key 0 clears everything (autoIncrement keys start at 1)
export async function clearAutosavedAbove(key: number): Promise<void> {
    if (!hasIndexedDb()) return;
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(IDBKeyRange.lowerBound(key, true));
    await transactionDone(tx);
}
