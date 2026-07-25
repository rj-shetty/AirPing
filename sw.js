/*!
 * Offline UPI
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// Service worker: precache the whole app, serve cache-first forever.
// The app is a fixed set of ~25 small files, so "cache everything up front"
// is both the simplest and the correct strategy. After the first visit,
// the app never needs the network again.

const VERSION = 'offline-upi-v1.9.0';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/theme-init.js',
  './js/ui.js',
  './js/store.js',
  './js/upi.js',
  './js/ussd.js',
  './js/qr.js',
  './js/haptics.js',
  './js/maker.js',
  './js/legal.js',
  './js/vendor/jsqr.js',
  './js/screens/home.js',
  './js/screens/pay.js',
  './js/screens/balance.js',
  './js/screens/scan.js',
  './js/screens/history.js',
  './js/screens/people.js',
  './js/screens/receive.js',
  './js/screens/guide.js',
  './js/screens/onboarding.js',
  './fonts/inter-400.woff2',
  './fonts/inter-700.woff2',
  './fonts/inter-900.woff2',
  './fonts/fragment-mono.woff2',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      // Anything not precached (shouldn't happen): try network, then shell.
      return fetch(request).catch(() => caches.match('./index.html'));
    })
  );
});
