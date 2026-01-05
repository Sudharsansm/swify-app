const CACHE_NAME = 'task-master-v1';
const ASSETS = [
    '/',
    '/static/css/style.css',
    '/static/manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => response || fetch(event.request))
    );
});
