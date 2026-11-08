/*!
 * AirPing
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// Home: the main payment action, compact shortcuts, and small live previews.

import { store } from '../store.js';
import { isAndroid, isIOS } from '../ussd.js';
import { formatINR } from '../upi.js';
import { qs, esc, icon, toast, sheet, avatarHtml, stampHtml, fmtTime } from '../ui.js';
import { haptics } from '../haptics.js';
import { openBalanceSheet } from './balance.js';
import { installPrompt, clearInstallPrompt } from '../main.js';

function runsStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  } catch {
    return false;
  }
}

export function initHome(root, { nav }) {
  function render() {
    const { settings, history } = store.get();
    const people = store.rankedPayees().slice(0, 3);
    const unconfirmed = store.latestUnconfirmed();
    const latest = history[0];
    const canInstall = !runsStandalone(); // installing is moot once installed

    root.innerHTML = `
      <div class="home-dashboard">
        <button type="button" class="action-card" data-go-pay>
          <span class="overline">Over *99# USSD</span>
          <h2>Send money</h2>
          <p>No data, no Wi-Fi needed.</p>
          ${icon('arrow', 'action-card-arrow')}
        </button>

        <div class="quick-actions" aria-label="Quick actions">
          <button type="button" class="quick-action" data-balance>
            ${icon('rupee')}
            <b>Balance</b>
          </button>
          <button type="button" class="quick-action quick-action--scan" data-go-scan>
            ${icon('scan')}
            <b>Scan</b>
          </button>
          <button type="button" class="quick-action" data-go-receive>
            ${icon('qr')}
            <b>Receive</b>
          </button>
        </div>

        <section class="home-section" aria-labelledby="recent-title">
          <div class="section-head">
            <h2 class="overline" id="recent-title">Recent payments</h2>
            <a class="linklike" href="#/history">All history</a>
          </div>
          ${latest ? `
            <div class="payment-preview">
              <div class="payment-preview-row">
                ${avatarHtml(latest.name || latest.vpa)}
                <button type="button" class="payment-preview-main" data-view-history aria-label="Open recent payment history">
                  <b>${esc(latest.name || latest.vpa)}</b>
                  <span>${esc(fmtTime(latest.at))}${latest.note ? ` · ${esc(latest.note)}` : ''}</span>
                </button>
                <span class="payment-preview-side">
                  <b>− ${esc(formatINR(latest.amount))}</b>
                  ${stampHtml(latest.status)}
                </span>
              </div>
              ${unconfirmed?.id === latest.id ? nudgeHtml(unconfirmed) : ''}
            </div>` : `
            <button type="button" class="payment-empty" data-go-pay>
              <span>No payments yet</span><b>Start your first payment ${icon('arrow')}</b>
            </button>`}
        </section>

        ${unconfirmed && unconfirmed.id !== latest?.id ? nudgeHtml(unconfirmed) : ''}

        ${!settings.setupDismissed ? `
          <div class="banner setup-banner">
            ${icon('sim')}
            <div>
              <b>First time on *99#?</b> Link this SIM to your bank once.
              <span class="banner-actions">
                <button type="button" class="linklike" data-go-setup>See how</button>
                <button type="button" class="linklike" data-dismiss-setup>Done already</button>
              </span>
            </div>
          </div>` : ''}

        <section class="home-section people-section" aria-labelledby="people-title">
            <div class="section-head">
              <h2 class="overline" id="people-title">People</h2>
              <a class="linklike" href="#/people">See all</a>
            </div>
            <div class="people-strip">
              ${people.map((p) => `
                <button type="button" class="person-chip" data-pay-vpa="${esc(p.vpa)}" title="Pay ${esc(p.name)}">
                  ${avatarHtml(p.name)}
                  <span>${esc(p.name)}</span>
                </button>`).join('')}
              <button type="button" class="person-chip person-chip--add" data-add-person aria-label="Add a person">
                <span class="add-person-mark">${icon('plus')}</span><span>Add</span>
              </button>
            </div>
        </section>

        ${canInstall ? `
          <div class="install-row">
            <button type="button" class="install-cta" data-install-app>
              ${icon('download')} Install AirPing (PWA)
            </button>
          </div>` : ''}
      </div>`;

    root.querySelectorAll('[data-go-pay]').forEach((button) =>
      button.addEventListener('click', () => {
        haptics.tap();
        nav.go('pay');
      }));
    qs('[data-go-scan]', root).addEventListener('click', () => nav.go('scan'));
    qs('[data-go-receive]', root).addEventListener('click', () => nav.go('receive'));
    qs('[data-view-history]', root)?.addEventListener('click', () => nav.go('history'));
    qs('[data-add-person]', root).addEventListener('click', () => nav.go('people', { add: true }));
    qs('[data-balance]', root).addEventListener('click', () => {
      haptics.tap();
      openBalanceSheet();
    });
    qs('[data-go-setup]', root)?.addEventListener('click', () => nav.go('guide', { section: 'setup' }));
    qs('[data-dismiss-setup]', root)?.addEventListener('click', () => {
      store.patchSettings({ setupDismissed: true });
    });
    qs('[data-install-app]', root)?.addEventListener('click', onInstallTap);
    root.querySelectorAll('[data-pay-vpa]').forEach((b) =>
      b.addEventListener('click', () => {
        haptics.tap();
        const p = store.findPayeeByVpa(b.dataset.payVpa);
        nav.go('pay', p ? { vpa: p.vpa, name: p.name } : null);
      }));

    root.querySelectorAll('[data-nudge]').forEach((nudge) => {
      qs('[data-yes]', nudge).addEventListener('click', () => {
        haptics.confirm();
        store.settlePayment(nudge.dataset.nudge, 'sent');
        toast('Marked as sent');
      });
      qs('[data-no]', nudge).addEventListener('click', () => {
        haptics.warn();
        store.settlePayment(nudge.dataset.nudge, 'failed');
        toast('Marked as failed', { icon: 'x' });
      });
    });
  }

  async function onInstallTap() {
    haptics.tap();
    // The real browser prompt when Chrome has offered one; instructions otherwise.
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice.catch(() => null);
      clearInstallPrompt();
      if (choice?.outcome === 'accepted') {
        toast('Installed. Look for it on your home screen');
      }
      return;
    }
    const steps = isIOS
      ? ['Open the Share menu in Safari', 'Scroll and tap "Add to Home Screen"', 'Tap Add. That is the whole install']
      : isAndroid
        ? ['Open the browser menu (the three dots)', 'Tap "Add to Home screen" or "Install app"', 'Confirm. It behaves like a normal app from then on']
        : ['Open this page in Chrome or Edge', 'Click the install icon in the address bar', 'Confirm, and it opens in its own window'];
    sheet(`
      <h2>Install the app</h2>
      <p class="sheet-sub">No store, no download page. The site itself is the app.</p>
      <ol class="walk" style="margin-top:20px">
        ${steps.map((s2) => `<li><b>${esc(s2)}</b></li>`).join('')}
      </ol>
      <button type="button" class="btn btn--primary btn--block" data-close>Got it</button>
    `);
  }

  function nudgeHtml(txn) {
    return `
      <div class="card confirm-nudge" data-nudge="${esc(txn.id)}">
        <div class="confirm-copy">
          <b>Did it reach ${esc(txn.name || txn.vpa)}?</b>
          <span class="small muted">Check your bank SMS</span>
        </div>
        <div class="nudge-actions">
          <button type="button" class="nudge-btn nudge-btn--yes" data-yes aria-label="Yes, it went through">${icon('check')}</button>
          <button type="button" class="nudge-btn nudge-btn--no" data-no aria-label="No, it failed">${icon('x')}</button>
        </div>
      </div>`;
  }

  store.subscribe(() => {
    if (root.classList.contains('is-active')) render();
  });

  return { onShow: render };
}
