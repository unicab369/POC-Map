/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

const TILE_CACHE = 'map-tiles-v1';
const TILE_HOSTS = ['basemaps.cartocdn.com', 'tile.openstreetmap.org'];

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((names) =>
			Promise.all(names.filter((n) => n !== TILE_CACHE).map((n) => caches.delete(n)))
		)
	);
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Only cache map tile requests
	if (!TILE_HOSTS.some((h) => url.hostname.endsWith(h))) return;

	event.respondWith(
		caches.open(TILE_CACHE).then(async (cache) => {
			const cached = await cache.match(event.request);
			if (cached) return cached;

			const response = await fetch(event.request);
			if (response.ok) {
				cache.put(event.request, response.clone());
			}
			return response;
		})
	);
});
