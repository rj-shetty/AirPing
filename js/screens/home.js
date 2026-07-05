/*!
 * Offline UPI
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// Home: one big verb, two smaller ones, your people, and anything that
// still needs your attention.

import { store } from '../store.js';
import { CODES, CARRIERS, isAndroid, isIOS } from '../ussd.js';
import { formatINR } from '../upi.js';
import { qs, esc, icon, toast, sheet, avatarHtml } from '../ui.js';
import { haptics } from '../haptics.js';
import { openBalanceSheet } from './balance.js';
import { openMakerSheet } from '../maker.js';
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
    const people = store.rankedPayees().slice(0, 8);
    const unconfirmed = store.latestUnconfirmed();
    const canInstall = !runsStandalone(); // installing is moot once installed

    root.innerHTML = `
      <div class="stack stack--loose">
        <button type="button" class="action-card" data-go-pay>
          <span class="overline">Over *99# ussd</span>
          <h2>Send money</h2>
          <p>No data, no Wi-Fi. Just your SIM and a UPI PIN.</p>
          ${icon('arrow', 'action-card-arrow')}
        </button>

        <div class="duo">
          <button type="button" class="mini-card" data-balance>
            ${icon('rupee')}
            <span><b>Balance</b><span class="mini-sub mono">${esc(CODES.balance.code)}</span></span>
          </button>
          <button type="button" class="mini-card" data-go-receive>
            ${icon('qr')}
            <span><b>Receive</b><span class="mini-sub">Your UPI ID &amp; QR</span></span>
          </button>
        </div>

        <button type="button" class="maker-credit" data-maker>
          Designed &amp; built by <b>Aayush Gupta</b> ${icon('ext')}
        </button>

        ${unconfirmed ? nudgeHtml(unconfirmed) : ''}

        ${people.length ? `
          <div>
            <div class="section-head">
              <span class="overline">People</span>
              <a class="linklike" href="#/people">See all</a>
            </div>
            <div class="people-strip">
              ${people.map((p) => `
                <button type="button" class="person-chip" data-pay-vpa="${esc(p.vpa)}" title="Pay ${esc(p.name)}">
                  ${avatarHtml(p.name)}
                  <span>${esc(p.name)}</span>
                </button>`).join('')}
            </div>
          </div>` : ''}

        ${!settings.setupDismissed ? `
          <div class="banner">
            ${icon('sim')}
            <div>
              <b>First time on *99#?</b> Your bank needs a one-time link to this SIM. Two minutes, once ever.
              <span class="banner-actions">
                <button type="button" class="linklike" data-go-setup>See how</button>
                <button type="button" class="linklike" data-dismiss-setup style="color:var(--text-faint)">Done already</button>
              </span>
            </div>
          </div>` : ''}

        <p class="carrier-strip">
          Works on ${CARRIERS.filter((c) => c.works).map((c) => `<b>${esc(c.name.split(' ')[0])}</b>`).join(' · ')}
          &nbsp;·&nbsp; <button type="button" class="carrier-legal" data-go-legal>Legal</button>
        </p>

        ${canInstall ? `
          <div style="text-align:center">
            <button type="button" class="install-cta" data-install-app>
              ${icon('download')} Install the app (PWA)
            </button>
          </div>` : ''}
      </div>`;

    qs('[data-go-pay]', root).addEventListener('click', () => {
      haptics.tap();
      nav.go('pay');
    });
    qs('[data-go-receive]', root).addEventListener('click', () => nav.go('receive'));
    qs('[data-balance]', root).addEventListener('click', () => {
      haptics.tap();
      openBalanceSheet();
    });
    qs('[data-go-setup]', root)?.addEventListener('click', () => nav.go('guide', { section: 'setup' }));
    qs('[data-go-legal]', root).addEventListener('click', () => {
      haptics.tap();
      nav.go('guide', { section: 'legal' });
    });
    qs('[data-dismiss-setup]', root)?.addEventListener('click', () => {
      store.patchSettings({ setupDismissed: true });
    });
    qs('[data-install-app]', root)?.addEventListener('click', onInstallTap);
    qs('[data-maker]', root).addEventListener('click', () => {
      haptics.tap();
      openMakerSheet();
    });
    root.querySelectorAll('[data-pay-vpa]').forEach((b) =>
      b.addEventListener('click', () => {
        haptics.tap();
        const p = store.findPayeeByVpa(b.dataset.payVpa);
        nav.go('pay', p ? { vpa: p.vpa, name: p.name } : null);
      }));

    const nudge = qs('[data-nudge]', root);
    if (nudge) {
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
    }
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
        ${avatarHtml(txn.name || txn.vpa)}
        <div class="row-main">
          <b>Did ${esc(formatINR(txn.amount))} reach ${esc(txn.name || txn.vpa)}?</b>
          <span class="small muted">Confirm from bank SMS</span>
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
