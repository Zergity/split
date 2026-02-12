// Minimal service worker for PWA install support
// No offline caching - app requires network

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
