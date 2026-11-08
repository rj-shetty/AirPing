/*!
 * AirPing
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// Guide: *99# setup steps, the code cheat sheet, common questions,
// and the app's few settings.

import { store } from '../store.js';
import { CODES, CARRIERS, dial, canPrefillDialer, copyText } from '../ussd.js';
import { qs, esc, icon, toast, confirmSheet } from '../ui.js';
import { haptics } from '../haptics.js';
import { applyTheme, installPrompt, clearInstallPrompt } from '../main.js';
import { legalHtml } from '../legal.js';

export function initGuide(root, { nav }) {
  function render() {
    const { settings } = store.get();

    root.innerHTML = `
      <h1 class="screen-title">Guide</h1>

      <div class="card card--ink" style="margin-top:16px" id="g-setup">
        <span class="overline">One-time setup</span>
        <h2 style="font-family:var(--font-display);font-size:1.35rem;font-weight:900;letter-spacing:-0.03em;margin-top:6px">Link your bank to *99#</h2>
        <p class="small muted" style="margin-top:6px">You only need to do this once. Use the SIM that is linked to your bank account.</p>
        <ol class="walk" style="margin-top:20px">
          <li><b>Dial <span class="mono">*99#</span> from your normal dialer</b><span class="small">Nothing to download for this part.</span></li>
          <li><b>Enter your bank name when it asks</b><span class="small">Short names work: SBI, HDFC, ICICI. The first 4 letters of your IFSC code work too.</span></li>
          <li><b>Pick your account from the list</b><span class="small">It finds accounts registered to your mobile number.</span></li>
          <li><b>Set a UPI PIN if you don't have one</b><span class="small">Keep your debit card handy. It asks for the last 6 digits and the expiry date.</span></li>
        </ol>
        ${canPrefillDialer
          ? `<button type="button" class="btn btn--gold btn--block" data-dial-setup>${icon('dial')} Dial *99# now</button>`
          : `<p class="small muted">Open this page on your Android phone to dial straight from here.</p>`}
      </div>

      <div class="card" style="margin-top:14px">
        <span class="overline">Cheat sheet</span>
        <div style="margin-top:8px">
          ${Object.values(CODES).map((c) => `
            <div class="code-row">
              <code>${esc(c.code)}</code>
              <span class="row-main">${esc(c.label)}</span>
              <button type="button" class="iconbtn" data-code="${esc(c.code)}" aria-label="${canPrefillDialer ? 'Dial' : 'Copy'} ${esc(c.code)}">
                ${icon(canPrefillDialer ? 'dial' : 'copy')}
              </button>
            </div>`).join('')}
        </div>
        <span class="overline" style="display:block;margin-top:18px">Carriers</span>
        <div class="carrier-chips">
          ${CARRIERS.map((c) => `
            <span class="carrier-chip ${c.works ? 'carrier-chip--ok' : 'carrier-chip--no'}">
              ${icon(c.works ? 'check' : 'x')} ${esc(c.name.split(' ')[0])}
            </span>`).join('')}
        </div>
        <p class="small muted" style="margin-top:12px">Support depends on your SIM's network, not on your phone.</p>
      </div>

      <div style="margin-top:26px">
        <span class="overline">Common questions</span>
        <div style="margin-top:10px">
          ${faq('How does this work without internet?', `
            <p>*99# is NPCI's official USSD service for UPI. When you dial it, the request travels on the same network channel as a phone call, so mobile data is never used.</p>
            <p>The menus are slow and text-only, which is why this app prepares everything first and hands you over ready to go. The money side is normal UPI: same banks, same PIN.</p>`)}
          ${faq('Is it safe?', `
            <p>You confirm every payment with your UPI PIN inside the carrier's own popup, the same way BHIM does it. This app never asks for your PIN and has no server, so nothing you do here leaves your phone.</p>`)}
          ${faq('What does it cost?', `
            <p>Your carrier may charge up to ₹0.50 per *99# session. That limit is set by TRAI, and many plans skip the charge entirely. The app itself is free and your bank charges nothing.</p>`)}
          ${faq('Why only up to ₹5,000?', `
            <p>NPCI limits USSD transfers to ₹5,000 per transaction. For larger amounts you need a regular UPI app with internet.</p>`)}
          ${faq('My session times out or says busy', `
            <p>A USSD prompt waits roughly 30 seconds before dropping the session. Have the amount ready and paste the UPI ID quickly. The app copies it to your clipboard before you dial.</p>
            <p>If the network says busy, wait a minute and dial again. It usually clears.</p>`)}
          ${faq('What about Jio?', `
            <p>Jio never added *99# support to its network, so a Jio SIM cannot use this. A SIM from Airtel, Vi or BSNL in the same phone works fine.</p>`)}
          ${faq('Can it track expenses from my bank SMS?', `
            <p>No. Web apps are not allowed to read SMS on any phone, so automatic expense tracking is not possible here. The ledger only records payments you confirm yourself.</p>`)}
          ${faq('What data does it store?', `
            <p>Saved people, your payment records and your settings, kept in this browser's storage on your phone. There is no account and no copy anywhere else. Clearing the site data removes everything.</p>`)}
        </div>
      </div>

      <div class="card" style="margin-top:26px">
        <span class="overline">Settings</span>
        <div style="margin-top:6px">
          <label class="setting-row">
            <span class="row-main"><b>Haptics</b><span class="small muted" style="display:block">Little taps on key presses</span></span>
            <span class="switch"><input type="checkbox" data-haptics ${settings.haptics ? 'checked' : ''} /><span class="switch-track"></span></span>
          </label>
          ${installPrompt ? `
            <div class="setting-row">
              <span class="row-main"><b>Install the app</b><span class="small muted" style="display:block">Home-screen icon, full offline</span></span>
              <button type="button" class="btn btn--small btn--primary" data-install>Install</button>
            </div>` : ''}
          <div class="setting-row">
            <span class="row-main"><b>Clear the ledger</b><span class="small muted" style="display:block">Removes payment records only</span></span>
            <button type="button" class="btn btn--small btn--ghost" data-clear-history>Clear</button>
          </div>
          <div class="setting-row">
            <span class="row-main"><b>Erase everything</b><span class="small muted" style="display:block">People, ledger and settings</span></span>
            <button type="button" class="btn btn--small btn--danger" data-erase>Erase</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <span class="overline">Stay safe</span>
        <ol class="walk" style="margin-top:14px">
          <li><b>Never tell anyone your UPI PIN</b><span class="small">Not "bank support", not this app, no one. It is only ever typed into the carrier's *99# popup.</span></li>
          <li><b>Receiving money never needs a PIN</b><span class="small">If someone says you must enter your PIN to receive a payment, it is a scam. End the call.</span></li>
          <li><b>Check the UPI ID before you dial</b><span class="small">The review screen shows the exact ID you are about to pay. Read it once, especially from scanned QRs.</span></li>
        </ol>
      </div>

      <div class="card" style="margin-top:14px" id="g-legal">
        <span class="overline">Legal</span>
        <div class="legal-text" style="margin-top:12px">${legalHtml()}</div>
      </div>

      <p class="footnote" style="margin-top:22px">
        Not a bank, not a payment service. Your carrier and bank do the real work over NPCI's *99# channel.
      </p>
    `;

    qs('[data-dial-setup]', root)?.addEventListener('click', () => {
      haptics.confirm();
      dial(CODES.menu.code);
    });

    root.querySelectorAll('[data-code]').forEach((b) =>
      b.addEventListener('click', async () => {
        haptics.tap();
        if (canPrefillDialer) dial(b.dataset.code);
        else {
          const ok = await copyText(b.dataset.code);
          toast(ok ? `${b.dataset.code} copied` : 'Could not copy', { icon: ok ? 'check' : 'x' });
        }
      }));

    qs('[data-haptics]', root).addEventListener('change', (e) => {
      store.patchSettings({ haptics: e.target.checked });
      haptics.tap();
    });

    qs('[data-install]', root)?.addEventListener('click', async () => {
      const prompt = installPrompt;
      if (!prompt) return;
      prompt.prompt();
      await prompt.userChoice;
      clearInstallPrompt();
      render();
    });

    qs('[data-clear-history]', root).addEventListener('click', async () => {
      const yes = await confirmSheet({
        title: 'Clear the ledger?',
        body: 'All payment records on this phone are removed. Real transactions at your bank are untouched.',
        confirmLabel: 'Clear it',
        danger: true,
      });
      if (yes) {
        store.clearHistory();
        toast('Ledger cleared');
      }
    });

    qs('[data-erase]', root).addEventListener('click', async () => {
      const yes = await confirmSheet({
        title: 'Erase everything?',
        body: 'People, ledger, your UPI ID and settings, gone from this phone. There is no undo.',
        confirmLabel: 'Erase it all',
        danger: true,
      });
      if (yes) {
        store.eraseEverything();
        applyTheme();
        toast('Fresh start');
        nav.go('home');
      }
    });
  }

  function faq(question, bodyHtml) {
    return `
      <details class="faq">
        <summary>${esc(question)} ${icon('chev')}</summary>
        <div class="faq-body">${bodyHtml}</div>
      </details>`;
  }

  return {
    onShow(params) {
      render();
      const anchor = { setup: '#g-setup', legal: '#g-legal' }[params?.section];
      if (anchor) {
        // let the screen switch settle, then bring the target into view
        requestAnimationFrame(() => qs(anchor, root)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
    },
  };
}
