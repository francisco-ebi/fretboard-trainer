// GitHub Pages cannot send the COOP/COEP headers that cross-origin isolation
// (and therefore SharedArrayBuffer) requires, so the service worker injects
// them into its responses instead (see src/sw.ts). The very first visit — or
// a hard refresh, which bypasses the SW — loads the document before the SW
// controls the page, so it arrives without those headers. Reload once as soon
// as the SW is ready; the reloaded navigation goes through the SW and comes
// back isolated.
const RELOAD_FLAG = "coi-reloaded";

function alreadyReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) !== null;
  } catch {
    // Storage unavailable: never auto-reload, so a broken setup cannot loop.
    return true;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    /* see alreadyReloaded */
  }
}

export function reloadOnceForCrossOriginIsolation(): void {
  // Already isolated: dev server (vite-plugin-cross-origin-isolation) or a
  // host that sends real headers, or a page already served through the SW.
  if (window.crossOriginIsolated) return;
  if (!("serviceWorker" in navigator)) return;
  // Controlled but not isolated: the controlling SW predates COI header
  // injection, so reloading would serve the same headers again. The update
  // flow (ReloadPrompt) activates the new SW instead.
  if (navigator.serviceWorker.controller) return;
  if (alreadyReloaded()) return;

  navigator.serviceWorker.ready.then(() => {
    markReloaded();
    window.location.reload();
  });
}
