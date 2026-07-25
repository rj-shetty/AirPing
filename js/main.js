/*!
 * Offline UPI
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

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.tab === name);
  });
  window.scrollTo({ top: 0 });
}

// ---- theme --------------------------------------------------------------------
// Light is the default; the topbar button flips to dark and back.

export function applyTheme() {
  let { theme } = store.get().settings;
  if (theme !== 'dark') theme = 'light'; // legacy 'auto' values land on light
  document.documentElement.dataset.theme = theme;
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
// While online, the line under the wordmark alternates between the tagline and
// a link to the repo. Going offline stops the swap and pins the offline notice.

const TAGLINE_MS = 3000;
const REPO_MS = 3500;
let subSwapTimer = null;

function showRepoPlug(show) {
  qs('.wordmark-subline').classList.toggle('show-repo', show);
  const plug = qs('#repo-plug');
  plug.tabIndex = show ? 0 : -1;
  plug.setAttribute('aria-hidden', String(!show));
}

function swapSubLine() {
  const show = !qs('.wordmark-subline').classList.contains('show-repo');
  showRepoPlug(show);
  subSwapTimer = setTimeout(swapSubLine, show ? REPO_MS : TAGLINE_MS);
}

function updateNetStatus() {
  const sub = qs('#net-status');
  if (navigator.onLine) {
    sub.textContent = 'Works without internet';
    sub.classList.remove('is-offline');
    if (subSwapTimer === null) subSwapTimer = setTimeout(swapSubLine, TAGLINE_MS);
  } else {
    sub.textContent = 'Offline right now. All good';
    sub.classList.add('is-offline');
    clearTimeout(subSwapTimer);
    subSwapTimer = null;
    showRepoPlug(false);
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
