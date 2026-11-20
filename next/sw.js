// Keeps a copy of the library's page on the device, so the library opens with no internet.
//
// It does one thing: when the page itself is asked for, it asks the website first, exactly as a
// browser would, and keeps what comes back. Only when the website can't be reached (no signal, or
// no answer within a few seconds) does it hand over the copy it kept. So with internet she always
// gets the newest version, as before; without it she gets the last one she opened.
//
// Everything else is left alone and goes straight to the network: her account, the book
// catalogues, covers, a preview of the next version under next/. Her books are not kept here;
// they live in the browser's own database, as they always have.
//
// tools/publish.mjs puts this file beside the page. To switch it off for everyone, publish a
// version whose "fetch" listener does nothing: browsers pick the new file up within a day.

const KEPT = 'library-page-v1';
const HOME = new URL(self.registration.scope);
const WAIT_MS = 4000;

// The first time: keep the page straight away (the browser has only just downloaded it, so this
// comes from its own short-term store, not down the line again). Failing to is not a problem:
// the page is kept the next time it is opened.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(KEPT)
      .then((cache) => fetch(HOME.href).then((response) => (response.ok ? cache.put(HOME.href, response) : undefined)))
      .catch(() => undefined),
  );
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/** The page itself: the folder's address, or its index.html. Not a page in a folder below it. */
const isThePage = (url) => url.origin === HOME.origin && (url.pathname === HOME.pathname || url.pathname === `${HOME.pathname}index.html`);

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  if (!isThePage(new URL(request.url))) return;
  event.respondWith(page(event, request));
});

async function page(event, request) {
  const cache = await caches.open(KEPT);
  const kept = await cache.match(HOME.href);
  const fresh = fetch(request).then((response) => {
    if (!response.ok) return kept ?? response; // the website is unwell: the kept copy, if there is one
    event.waitUntil(cache.put(HOME.href, response.clone()).catch(() => undefined));
    return response;
  });
  if (!kept) return fresh;
  event.waitUntil(fresh.catch(() => undefined)); // if the kept copy is shown, the newer one still gets kept for next time
  return Promise.race([fresh.catch(() => kept), new Promise((resolve) => setTimeout(() => resolve(kept), WAIT_MS))]);
}
