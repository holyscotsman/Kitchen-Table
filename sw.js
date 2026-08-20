/* Kitchen Table — the service worker.
 *
 * One job: make the book instant and unkillable on the devices that matter.
 * The shell and recipes.json are served cache-first with a background
 * refresh (the spec's own words: render from cache immediately, fetch
 * fresh behind it), and the page itself is network-first so a deploy still
 * arrives on the next open. Everything cross-origin — the link-import
 * relays, the kitchen server on Render, the OCR CDN — is deliberately NOT
 * handled here: those requests take the native path, so the app's existing
 * disclosure and failure behaviour (and the hermetic test suites that stub
 * those hosts) are untouched.
 *
 * localStorage/IndexedDB state (kt.recipes overlay, photos, the plan) is
 * above this layer and unaffected: the overlay stays authoritative.
 */
"use strict";

const CACHE = "kt-shell-v2";

/* How long the book's own request may hold the app up before the cached
 * copy is served instead. Long enough that a healthy connection always
 * wins (the file is ~60KB); short enough that a bad one is never the
 * reader's problem. */
const NET_FIRST_MS = 2000;
const SHELL = [
  "./",
  "index.html",
  "app.js",
  "style.css",
  "tokens.css",
  "recipes.json",
  "manifest.json",
  "favicon.svg",
  "fonts/fonts.css",
  "fonts/atkinson-400.woff2",
  "fonts/atkinson-700.woff2"
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (ev) => {
  /* A new shell version starts clean — old caches go. No clients.claim():
   * pages already open keep their native path until their next load, which
   * keeps first-visit behaviour (and the perf suite's measurements) native. */
  ev.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith("kt-shell-") && k !== CACHE)
        .map((k) => caches.delete(k))
    ))
  );
});

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // native path, on purpose

  /* The document: network-first so deploys land immediately, cache as the
   * offline fallback. */
  if (req.mode === "navigate" || req.destination === "document") {
    ev.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("index.html", copy));
          return res;
        })
        .catch(() => caches.match("index.html", { cacheName: CACHE }))
    );
    return;
  }

  /* The recipes themselves are DATA, not shell: a recipe published an hour
   * ago must appear on the next open, not the one after. Network-first
   * with the cache as fallback keeps the book both current and offline —
   * the shell below stays cache-first, so the page still paints instantly
   * while this one request settles.
   *
   * With a clock on it, though. A weak signal is not an outage and must not
   * behave like one: without this the book waited for the browser's own
   * timeout — tens of seconds, in a kitchen with one bar — while a complete
   * copy sat in the cache the whole time. The network gets NET_FIRST_MS to
   * answer; past that the cached book is served and the late answer is
   * still stored, which is what makes the NEXT open current. A first visit
   * has nothing cached and simply waits, as it must. */
  if (url.pathname.endsWith("/recipes.json")) {
    /* Matched and stored by URL string, not by Request: the app asks for
     * the book with `cache: "no-cache"`, and a Request carrying that mode
     * does not reliably match a stored entry — the offline fallback has
     * to be exact about what it looks up. */
    ev.respondWith(
      caches.open(CACHE).then((c) => {
        const net = fetch(req).then((res) => {
          if (res && res.ok) c.put(url.pathname, res.clone());
          return res;
        });
        /* The put above outlives the response we hand back, so the worker
         * must be kept alive for it. */
        ev.waitUntil(net.catch(() => {}));
        return c.match(url.pathname).then((cached) => {
          if (!cached) return net;
          return Promise.race([
            net.catch(() => cached),
            new Promise((r) => setTimeout(() => r(cached.clone()), NET_FIRST_MS))
          ]);
        });
      })
    );
    return;
  }

  /* Everything else same-origin: stale-while-revalidate. Serve what we
   * have instantly, refresh it behind the reader for next time. */
  ev.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(req).then((cached) => {
        const refresh = fetch(req).then((res) => {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || refresh;
      })
    )
  );
});
