/*!
 * AirPing
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// Receive: your UPI ID, big and scannable. The QR is generated on-device by
// our own encoder (js/qr.js). Handy for payers who do have internet, while
// the printed ID below works for fellow *99# users.

import { store } from '../store.js';
import { isValidVpa, parseAmount, buildUpiUri, formatINR } from '../upi.js';
import { copyText } from '../ussd.js';
import { makeQR, qrToSvg } from '../qr.js';
import { qs, esc, icon, sheet, toast } from '../ui.js';
import { haptics } from '../haptics.js';

export function initReceive(root, { nav }) {
  let requestAmount = null;

  function render() {
    const { profile } = store.get();
    if (!profile.vpa) {
      renderSetup();
      return;
    }

    const uri = buildUpiUri({
      vpa: profile.vpa,
      name: profile.name || undefined,
      amount: requestAmount || undefined,
    });
    let qrSvg;
    try {
      qrSvg = qrToSvg(makeQR(uri));
    } catch {
      qrSvg = '';
    }

    root.innerHTML = `
      <div class="flow-head" style="margin-bottom:10px">
        <h1 class="screen-title" style="flex:1">Receive</h1>
        <button type="button" class="iconbtn" data-edit-profile aria-label="Change your UPI ID">${icon('pencil')}</button>
      </div>

      <div class="card qr-card">
        <div class="qr-box">${qrSvg}</div>
        <div class="qr-name">${esc(profile.name || 'You')}</div>
        <div class="qr-vpa">${esc(profile.vpa)}</div>
        ${requestAmount ? `<div class="qr-amount-tag"><span class="stamp stamp--wait">Asking ${esc(formatINR(requestAmount))}</span></div>` : ''}
      </div>

      <div class="duo" style="margin-top:14px">
        <button type="button" class="btn btn--ghost" data-copy>${icon('copy')} Copy ID</button>
        <button type="button" class="btn btn--ghost" data-amount>${icon('rupee')} ${requestAmount ? 'Change amount' : 'Ask an amount'}</button>
      </div>
      ${navigator.share ? `<button type="button" class="btn btn--primary btn--block" data-share style="margin-top:12px">${icon('share')} Share payment link</button>` : ''}

      <p class="footnote">Scanners with internet pay you the usual way.<br/>Fellow *99# users can type your ID, printed right under the code.</p>
    `;

    qs('[data-copy]', root).addEventListener('click', async () => {
      haptics.tap();
      const ok = await copyText(store.get().profile.vpa);
      toast(ok ? 'Your UPI ID is copied' : 'Could not copy', { icon: ok ? 'check' : 'x' });
    });
    qs('[data-edit-profile]', root).addEventListener('click', renderSetup);
    qs('[data-amount]', root).addEventListener('click', promptAmount);
    qs('[data-share]', root)?.addEventListener('click', async () => {
      try {
        await navigator.share({ title: 'Pay me over UPI', text: uri });
      } catch { /* user closed the share sheet */ }
    });
  }

  function promptAmount() {
    const s = sheet(`
      <h2>Ask for an amount</h2>
      <p class="sheet-sub">It gets baked into the QR, so the payer's app fills it in for them.</p>
      <label class="field" style="margin-top:18px">
        <span class="field-label">Amount · ₹</span>
        <input class="input" data-req type="text" inputmode="decimal" placeholder="e.g. 250"
               value="${requestAmount ?? ''}" />
        <span class="field-hint" data-req-hint></span>
      </label>
      <div class="stack" style="margin-top:14px">
        <button type="button" class="btn btn--primary btn--block" data-set>Update QR</button>
        ${requestAmount ? '<button type="button" class="btn btn--ghost btn--block" data-clear>Remove the amount</button>' : ''}
      </div>
    `);
    const input = qs('[data-req]', s.el);
    const hint = qs('[data-req-hint]', s.el);
    qs('[data-set]', s.el).addEventListener('click', () => {
      const raw = input.value.trim();
      if (!raw) { requestAmount = null; s.close(); render(); return; }
      const parsed = parseAmount(raw);
      if (parsed == null || parsed < 1) {
        hint.className = 'field-hint is-error';
        hint.textContent = 'A whole or two-decimal amount of at least ₹1.';
        input.classList.add('is-invalid');
        haptics.warn();
        return;
      }
      haptics.confirm();
      requestAmount = parsed;
      s.close();
      render();
    });
    qs('[data-clear]', s.el)?.addEventListener('click', () => {
      requestAmount = null;
      s.close();
      render();
    });
    input.focus({ preventScroll: true });
  }

  function renderSetup() {
    const { profile } = store.get();
    root.innerHTML = `
      <h1 class="screen-title">Receive</h1>
      <p class="muted small" style="margin-top:6px">Set this once. It stays on your phone.</p>
      <div class="card" style="margin-top:18px">
        <label class="field">
          <span class="field-label">Your name</span>
          <input class="input" data-name type="text" maxlength="40" placeholder="As payers should see it" value="${esc(profile.name)}" />
        </label>
        <label class="field">
          <span class="field-label">Your UPI ID</span>
          <input class="input input--mono" data-vpa type="text" inputmode="email" autocapitalize="none" maxlength="60"
                 spellcheck="false" placeholder="you@bank" value="${esc(profile.vpa)}" />
          <span class="field-hint" data-hint>The same ID other apps show for your account.</span>
        </label>
        <button type="button" class="btn btn--primary btn--block" data-save disabled>Show my QR</button>
      </div>
    `;

    const nameInput = qs('[data-name]', root);
    const vpaInput = qs('[data-vpa]', root);
    const save = qs('[data-save]', root);
    const hint = qs('[data-hint]', root);

    const check = () => {
      const valid = isValidVpa(vpaInput.value.trim());
      save.disabled = !valid;
      vpaInput.classList.toggle('is-invalid', !!vpaInput.value.trim() && !valid);
      hint.className = 'field-hint' + (valid ? ' is-good' : '');
      hint.textContent = valid ? 'Looks good' : 'The same ID other apps show for your account.';
    };
    vpaInput.addEventListener('input', check);
    check();

    save.addEventListener('click', () => {
      haptics.confirm();
      store.setProfile({ name: nameInput.value.trim(), vpa: vpaInput.value.trim() });
      render();
    });
  }

  return { onShow: render };
}
