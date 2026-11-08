/*!
 * AirPing
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// Sets the theme before first paint; dark is the dashboard's default.
// Kept as a separate file (not inline) so the CSP can stay script-src 'self'.
try {
  var t = JSON.parse(localStorage.getItem('offline-upi:v1')).settings.theme;
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
} catch (e) {
  document.documentElement.dataset.theme = 'dark';
}
var themeColor = document.documentElement.dataset.theme === 'light' ? '#ffffff' : '#111c30';
document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
  meta.setAttribute('content', themeColor);
});

// Capture the browser's install prompt the instant it fires. The app's own
// modules are deferred, so beforeinstallprompt often arrives before they run;
// stash it on window and let the app pick it up (and be notified) later.
window.__deferredInstall = null;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.__deferredInstall = e;
  window.dispatchEvent(new Event('installready'));
});
window.addEventListener('appinstalled', function () {
  window.__deferredInstall = null;
  window.dispatchEvent(new Event('installdone'));
});
