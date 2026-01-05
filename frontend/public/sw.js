const CACHE_NAME = 'swify-diamond-v2';
const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/logo.png',
    '/screenshot1.png',
    '/screenshot2.png',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Static assets: Cache-First
    if (ASSETS.includes(new URL(event.request.url).pathname)) {
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request);
            })
        );
    } else {
        // Network-First for API and other dynamic content
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match(event.request);
            })
        );
    }
});
