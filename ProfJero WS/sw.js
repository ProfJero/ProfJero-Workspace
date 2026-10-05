// sw.js - Service Worker for ProfJero OS PWA

const CACHE_NAME = 'profjero-cache-v2';
const OFFLINE_URL = '/offline.html';

// Files to cache for offline access
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/login.html',
  '/signup.html',
  '/offline.html',
  '/manifest.json',
  '/js/firebase-config.js',
  '/js/utils/helpers.js',
  '/js/pages/dashboard.js',
  '/js/pages/tasks.js',
  '/js/pages/projects.js',
  '/js/pages/notes.js',
  '/js/pages/finance.js',
  '/js/pages/profile.js',
  '/js/pages/settings.js',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png'
];

// Install event
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        console.log('[Service Worker] Caching app shell');
        try {
          await cache.addAll(FILES_TO_CACHE);
          console.log('[Service Worker] Cache successful');
        } catch (error) {
          console.error('[Service Worker] Cache failed:', error);
        }
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests and Firebase API calls
  if (event.request.method !== 'GET' || 
      url.href.includes('firestore.googleapis.com') ||
      url.href.includes('firebase')) {
    return;
  }
  
  // For HTML pages - network first, fallback to cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }
          return caches.match(OFFLINE_URL);
        })
    );
    return;
  }
  
  // For static assets - cache first
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          })
          .catch(error => {
            console.error('Fetch failed:', event.request.url, error);
            return new Response('Network error', { status: 503 });
          });
      })
  );
});