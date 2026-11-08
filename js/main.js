/*!
 * AirPing
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// Boot + a hash router small enough to read in one sitting.

import { store } from './store.js';
import { qs, toast } from './ui.js';
import { initHome } from './screens/home.js';
import { initPay } from './screens/pay.js';
import { initScan } from './screens/scan.js';
import { initHistory } from './screens/history.js';
import { initPeople } from './screens/people.js';
import { initReceive } from './screens/receive.js';
import { initGuide } from './screens/guide.js';
import { maybeShowOnboarding } from './screens/onboarding.js';

// ---- router -----------------------------------------------------------------

const screens = new Map(); // name -> { el, onShow?, onHide? }
let current = null;
let currentName = 'home';
let pendingParams = null;

export const nav = {
  go(name, params = null) {
    pendingParams = params;
    const target = '#/' + name;
    if (location.hash === target) route();
    else location.hash = target;
  },
};

function registerScreen(name, hooks = {}) {
  const elx = qs(`[data-screen="${name}"]`);
  screens.set(name, { el: elx, ...hooks });
}

function route() {
  const name = (location.hash.replace(/^#\//, '') || 'home').split('?')[0];
  const next = screens.get(name) ?? screens.get('home');
  const params = pendingParams;
  pendingParams = null;

  if (current && current !== next) {
    current.onHide?.();
    current.el.classList.remove('is-active');
  }
  next.el.classList.add('is-active');
  next.onShow?.(params);
  if (current !== next) next.el.scrollTop = 0;
  current = next;
  currentName = name;

  document.querySelectorAll('[data-top-route]').forEach((link) => {
    const active = link.dataset.topRoute === name;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  qs('#screens').scrollTop = 0;
  window.scrollTo({ top: 0 });
}

function wireTopNavigation() {
  document.querySelectorAll('[data-top-route]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const target = link.dataset.topRoute;
      nav.go(currentName === target ? 'home' : target);
    });
  });
}

// ---- theme --------------------------------------------------------------------
// Dark is the dashboard default; the topbar button flips themes.

export function applyTheme() {
  let { theme } = store.get().settings;
  if (theme !== 'light') theme = 'dark'; // legacy 'auto' values land on dark
  document.documentElement.dataset.theme = theme;
  const themeColor = theme === 'light' ? '#ffffff' : '#111c30';
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', themeColor);
  });
  const iconUse = qs('#theme-toggle [data-theme-icon] use');
  if (iconUse) iconUse.setAttribute('href', theme === 'dark' ? '#i-sun' : '#i-moon');
}

function wireThemeToggle() {
  qs('#theme-toggle').addEventListener('click', () => {
    const next = store.get().settings.theme === 'dark' ? 'light' : 'dark';
    store.patchSettings({ theme: next });
    applyTheme();
  });
}

// ---- connectivity status line ----------------------------------------------------
// Keep the status under the wordmark focused on connectivity.

function updateNetStatus() {
  const sub = qs('#net-status');
  if (navigator.onLine) {
    sub.textContent = 'Works without internet';
    sub.classList.remove('is-offline');
  } else {
    sub.textContent = 'Offline right now. All good';
    sub.classList.add('is-offline');
  }
}

// ---- install prompt ---------------------------------------------------------------
// theme-init.js captures the event early (before these modules load) onto
// window.__deferredInstall. We start from whatever it already grabbed, then
// stay in sync and re-render so the Install button is always live-wired.

export let installPrompt = window.__deferredInstall ?? null;

function onInstallReady() {
  installPrompt = window.__deferredInstall;
  // Refresh Home / Guide so their install affordances reflect availability.
  if (currentName === 'home' || currentName === 'guide') current?.onShow?.();
}
window.addEventListener('installready', onInstallReady);
window.addEventListener('beforeinstallprompt', onInstallReady); // in case it fires late
window.addEventListener('installdone', () => {
  installPrompt = null;
  if (currentName === 'home' || currentName === 'guide') current?.onShow?.();
});

export function clearInstallPrompt() {
  installPrompt = null;
  window.__deferredInstall = null;
}

// ---- boot ---------------------------------------------------------------------------

function boot() {
  applyTheme();

  const ctx = { nav };
  registerScreen('home', initHome(qs('[data-screen="home"]'), ctx));
  registerScreen('pay', initPay(qs('[data-screen="pay"]'), ctx));
  registerScreen('scan', initScan(qs('[data-screen="scan"]'), ctx));
  registerScreen('history', initHistory(qs('[data-screen="history"]'), ctx));
  registerScreen('people', initPeople(qs('[data-screen="people"]'), ctx));
  registerScreen('receive', initReceive(qs('[data-screen="receive"]'), ctx));
  registerScreen('guide', initGuide(qs('[data-screen="guide"]'), ctx));

  wireTopNavigation();
  window.addEventListener('hashchange', route);
  route();

  wireThemeToggle();
  window.addEventListener('online', updateNetStatus);
  window.addEventListener('offline', updateNetStatus);
  updateNetStatus();

  qs('#app').hidden = false;
  maybeShowOnboarding(ctx);

  registerServiceWorker();
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    // Surface updates once, quietly.
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Update ready', {
            icon: 'check',
            action: 'Refresh',
            onAction: () => location.reload(),
            sticky: true,
          });
        }
      });
    });
  } catch {
    // Offline-first still works within this session; the SW will register next time.
  }
}

boot();
