import {
  cleanupOutdatedCaches,
  PrecacheController,
  PrecacheRoute,
} from "workbox-precaching";
import { NavigationRoute, Router } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope;

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const precacheController = new PrecacheController();
precacheController.precache(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Explicit Router (instead of registerRoute's implicit fetch listener) so the
// single fetch handler below can append COOP/COEP headers to every response.
// GitHub Pages cannot send custom headers, and without these the page is not
// cross-origin isolated and SharedArrayBuffer — which the audio ring buffers
// require — does not exist. First visit needs one reload to come under SW
// control; src/app/coi-reload.ts handles that.
const router = new Router();
router.registerRoute(new PrecacheRoute(precacheController));
router.registerRoute(
  new NavigationRoute(precacheController.createHandlerBoundToURL("index.html")),
);

const COI_HEADERS: Readonly<Record<string, string>> = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

function withCoiHeaders(response: Response): Response {
  // Opaque/error responses cannot be reconstructed.
  if (response.status === 0) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(COI_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // DevTools-initiated only-if-cached requests cannot be passed to fetch().
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
    return;
  }

  const handled = router.handleRequest({ request, event });
  if (handled) {
    event.respondWith(handled.then(withCoiHeaders));
    return;
  }

  // Not matched by workbox: runtime-fetched assets such as the feature-worker
  // bundles (excluded from the precache) and datasets. Worker scripts must
  // also carry COEP for the isolated page to load them.
  if (
    request.method === "GET" &&
    new URL(request.url).origin === self.location.origin
  ) {
    event.respondWith(fetch(request).then(withCoiHeaders));
  }
});
