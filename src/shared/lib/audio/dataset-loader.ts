// Large training datasets live in public/datasets/ and are fetched on demand
// instead of being bundled into JS chunks (they added ~16MB gz to the build
// and were precached by the service worker on first visit).
export async function fetchDataset<T>(relativePath: string): Promise<T> {
    const url = `${import.meta.env.BASE_URL}datasets/${relativePath}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load dataset ${url}: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
}
