// Reign's service worker, so the game installs as an app and opens fast (or with no network in
// the offline build). vite.config.ts fills in VERSION, SHELL and ASSETS for each build and writes
// this out as /sw.js. Never touches /api, /ws or /health: accounts and games always go to the server.

const VERSION = __VERSION__;
/** The page and its code, stored when this worker installs. */
const SHELL = __SHELL__;
/** Every hashed file of this build, so files of older builds can be dropped. */
const ASSETS = new Set(__ASSETS__);

const SHELL_CACHE = `reign-shell-${VERSION}`;
/** Fonts, sounds, music and icons, stored the first time they're used. */
const FILES_CACHE = 'reign-files';

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(SHELL_CACHE)
			.then((cache) => cache.addAll(SHELL))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key.startsWith('reign-shell-') && key !== SHELL_CACHE) await caches.delete(key);
			}
			const files = await caches.open(FILES_CACHE);
			for (const req of await files.keys()) {
				const path = new URL(req.url).pathname;
				if (path.startsWith('/assets/') && !ASSETS.has(path)) await files.delete(req);
			}
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;
	const path = url.pathname;
	if (path.startsWith('/api/') || path === '/ws' || path === '/health' || path === '/sw.js') return;
	// The music streams through <audio>, which asks for byte ranges: leave those to the network.
	if (req.headers.has('range')) return;

	if (req.mode === 'navigate') event.respondWith(page(req));
	else if (path.startsWith('/assets/')) event.respondWith(hashed(req));
	else event.respondWith(file(req, event));
});

/** The page: always the newest from the network, the stored one when there's no network. */
async function page(req) {
	try {
		return await fetch(req);
	} catch (e) {
		const shell = await caches.open(SHELL_CACHE);
		const stored = await shell.match('/');
		if (stored) return stored;
		throw e;
	}
}

/** Hashed build files never change, so a stored copy is always right. */
async function hashed(req) {
	const stored = await caches.match(req);
	if (stored) return stored;
	const res = await fetch(req);
	if (res.ok) {
		const copy = res.clone();
		caches.open(FILES_CACHE).then((cache) => cache.put(req, copy));
	}
	return res;
}

/** Sounds, music and icons keep their names when they change: answer from the store, then refresh it. */
async function file(req, event) {
	const cache = await caches.open(FILES_CACHE);
	const stored = await cache.match(req);
	const fresh = fetch(req).then((res) => {
		if (res.ok) cache.put(req, res.clone());
		return res;
	});
	if (stored) {
		event.waitUntil(fresh.catch(() => {}));
		return stored;
	}
	return fresh;
}
