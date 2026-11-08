/*!
 * AirPing
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// The pay flow. Three steps: who, how much, and the dialer handoff.
//
// A browser can't drive a USSD session (that needs the Android accessibility
// stack), so this screen's whole job is to make the manual session
// effortless: validate everything up front, put the UPI ID on the clipboard,
// open the dialer with *99*1*3# typed in, and rehearse the four carrier
// prompts before they appear. When the user comes back, we ask how it went
// and keep the ledger honest.

import { store } from '../store.js';
import {
  isValidVpa, vpaProvider, parseAmount, amountIssue, groupIndian,
  amountInWords, formatINR, MAX_AMOUNT,
} from '../upi.js';
import { CODES, SEND_STEPS, telLink, canPrefillDialer, copyText } from '../ussd.js';
import { qs, esc, icon, sheet, toast, avatarHtml } from '../ui.js';
import { haptics } from '../haptics.js';

const AWAIT_KEY = 'offline-upi:awaiting';

let navRef = null;

export function initPay(root, { nav }) {
  navRef = nav;
  const state = fresh();

  function fresh() {
    return { step: 1, vpa: '', name: '', amountStr: '', note: '' };
  }

  function onShow(params) {
    Object.assign(state, fresh());
    if (params?.vpa && isValidVpa(params.vpa)) {
      state.vpa = params.vpa.trim();
      // QR-supplied names are attacker-controlled; cap them like typed ones.
      state.name = (params.name?.trim() || '').slice(0, 40);
      if (params.amount) state.amountStr = String(params.amount);
      if (params.note) state.note = params.note.slice(0, 30);
      state.step = 2;
    }
    render();
  }

  function head(title) {
    return `
      <div class="flow-head">
        <button type="button" class="iconbtn" data-back aria-label="Back">${icon('back')}</button>
        <h1 class="screen-title">${esc(title)}</h1>
        <div class="dots" aria-label="Step ${state.step} of 3">
          ${[1, 2, 3].map((i) => `<i class="${i <= state.step ? 'is-on' : ''}"></i>`).join('')}
        </div>
      </div>`;
  }

  function render() {
    if (state.step === 1) renderWho();
    else if (state.step === 2) renderAmount();
    else renderReview();
  }

  // ---- step 1 · who -----------------------------------------------------

  function renderWho() {
    const people = store.rankedPayees();
    root.innerHTML = `
      ${head('Who gets it?')}
      <label class="field">
        <span class="field-label">UPI ID</span>
        <input class="input input--mono" data-vpa type="text" inputmode="email" autocomplete="off" maxlength="60"
               autocapitalize="none" spellcheck="false" placeholder="name@bank" value="${esc(state.vpa)}" />
        <span class="field-hint" data-vpa-hint></span>
      </label>
      <button type="button" class="btn btn--primary btn--block" data-next disabled>
        Continue ${icon('arrow')}
      </button>
      ${people.length ? `
        <div style="margin-top:26px">
          <span class="overline">Saved people</span>
          <div class="rows" data-people style="margin-top:6px"></div>
        </div>` : ''}
    `;

    const input = qs('[data-vpa]', root);
    const hint = qs('[data-vpa-hint]', root);
    const next = qs('[data-next]', root);
    const list = qs('[data-people]', root);

    const refresh = () => {
      const value = input.value.trim();
      state.vpa = value;
      const valid = isValidVpa(value);
      next.disabled = !valid;
      hint.className = 'field-hint';
      if (!value) {
        hint.textContent = '';
      } else if (valid) {
        const provider = vpaProvider(value);
        hint.classList.add('is-good');
        hint.textContent = provider ? `Looks like a ${provider} ID` : 'Looks good';
        const known = store.findPayeeByVpa(value);
        state.name = known?.name ?? '';
      } else {
        hint.textContent = 'Something like name@bank. Letters, numbers, dots.';
      }
      renderPeople(value);
    };

    const renderPeople = (query) => {
      if (!list) return;
      const q = query.toLowerCase();
      const matches = people.filter((p) =>
        !q || p.name.toLowerCase().includes(q) || p.vpa.toLowerCase().includes(q));
      list.innerHTML = matches.slice(0, 6).map((p) => `
        <button type="button" class="row" data-pick="${esc(p.vpa)}">
          ${avatarHtml(p.name)}
          <span class="row-main"><b>${esc(p.name)}</b><span class="small muted mono">${esc(p.vpa)}</span></span>
          ${icon('arrow', 'row-go')}
        </button>`).join('') ||
        `<p class="small muted" style="padding:12px 2px">No match. Type the full UPI ID above.</p>`;
      list.querySelectorAll('[data-pick]').forEach((b) =>
        b.addEventListener('click', () => {
          const p = store.findPayeeByVpa(b.dataset.pick);
          haptics.tap();
          state.vpa = p.vpa;
          state.name = p.name;
          state.step = 2;
          render();
        }));
    };

    input.addEventListener('input', refresh);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !next.disabled) next.click();
    });
    next.addEventListener('click', () => {
      haptics.tap();
      state.step = 2;
      render();
    });
    qs('[data-back]', root).addEventListener('click', () => navRef.go('home'));
    refresh();
    if (!state.vpa) input.focus({ preventScroll: true });
  }

  // ---- step 2 · amount ----------------------------------------------------

  function renderAmount() {
    root.innerHTML = `
      ${head('How much?')}
      <button type="button" class="paying-to" data-edit-who>
        ${avatarHtml(state.name || state.vpa)}
        <b>${esc(state.name || state.vpa)}</b>
        ${icon('pencil', 'row-go')}
      </button>
      <div class="amount-wrap">
        <div class="amount-display" data-amount aria-live="polite"></div>
        <div class="amount-words" data-words></div>
        <div class="amount-error" data-amount-error></div>
      </div>
      <div class="quick-amounts">
        ${[100, 200, 500].map((v) => `<button type="button" class="chip" data-quick="${v}">₹${v}</button>`).join('')}
      </div>
      <div class="keypad" data-keypad>
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button type="button" data-key="${d}">${d}</button>`).join('')}
        <button type="button" data-key=".">·</button>
        <button type="button" class="key-zero" data-key="0">0</button>
        <button type="button" data-key="back" aria-label="Delete">${icon('back')}</button>
      </div>
      <label class="field" style="margin-top:16px">
        <span class="field-label">Note · optional</span>
        <input class="input" data-note type="text" maxlength="30" placeholder="e.g. rent, chai, half of dinner" value="${esc(state.note)}" />
      </label>
      <button type="button" class="btn btn--primary btn--block" data-next style="margin-top:16px" disabled>
        Review ${icon('arrow')}
      </button>
    `;

    const display = qs('[data-amount]', root);
    const words = qs('[data-words]', root);
    const error = qs('[data-amount-error]', root);
    const next = qs('[data-next]', root);

    const paint = () => {
      const str = state.amountStr;
      const [whole = '', frac] = str.split('.');
      const grouped = groupIndian(whole) + (str.includes('.') ? '.' + (frac ?? '') : '');
      display.innerHTML = `<span class="rupee">₹</span>${esc(grouped || '0')}<span class="cursor"></span>`;
      const value = parseAmount(str);
      const issue = str ? amountIssue(value) : null;
      words.textContent = value && !issue ? amountInWords(value) : '';
      error.textContent = issue && str ? issue : '';
      next.disabled = !str || !!issue;
      root.querySelectorAll('[data-quick]').forEach((c) =>
        c.classList.toggle('is-on', Number(c.dataset.quick) === value));
    };

    const press = (key) => {
      let s = state.amountStr;
      if (key === 'back') s = s.slice(0, -1);
      else if (key === '.') {
        if (!s.includes('.')) s = (s || '0') + '.';
      } else {
        if (s === '0') s = '';
        const [w = '', f] = s.split('.');
        if (s.includes('.')) {
          if ((f ?? '').length >= 2) return;
        } else if (w.length >= 4) return; // cap is ₹5,000 anyway
        s += key;
      }
      state.amountStr = s;
      haptics.key();
      paint();
    };

    qs('[data-keypad]', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-key]');
      if (b) press(b.dataset.key);
    });
    root.querySelectorAll('[data-quick]').forEach((c) =>
      c.addEventListener('click', () => {
        haptics.tap();
        state.amountStr = c.dataset.quick;
        paint();
      }));
    qs('[data-note]', root).addEventListener('input', (e) => {
      state.note = e.target.value;
    });
    qs('[data-edit-who]', root).addEventListener('click', () => {
      state.step = 1;
      render();
    });
    qs('[data-back]', root).addEventListener('click', () => {
      state.step = 1;
      render();
    });
    next.addEventListener('click', () => {
      haptics.tap();
      state.step = 3;
      render();
    });
    paint();
  }

  // ---- step 3 · review & dial ----------------------------------------------

  function renderReview() {
    const amount = parseAmount(state.amountStr);
    const note = state.note.trim();
    const knownPayee = store.findPayeeByVpa(state.vpa);

    root.innerHTML = `
      ${head('Ready to dial')}
      <div class="receipt">
        <div class="receipt-head">
          <span class="overline">Paying</span>
          <div class="receipt-amount"><span class="rupee">₹</span>${esc(groupIndian(String(amount)))}</div>
          <div class="receipt-words">${esc(amountInWords(amount))}</div>
        </div>
        <div class="tear"></div>
        <dl class="receipt-lines">
          <div class="receipt-line"><dt>To</dt><dd>${esc(state.name || state.vpa.split('@')[0])}</dd></div>
          <div class="receipt-line"><dt>UPI ID</dt><dd class="mono">${esc(state.vpa)}</dd></div>
          ${note ? `<div class="receipt-line"><dt>Note</dt><dd>${esc(note)}</dd></div>` : ''}
          <div class="receipt-line"><dt>Via</dt><dd class="mono">${esc(CODES.sendToVpa.code)} · USSD</dd></div>
        </dl>
      </div>

      <div style="margin-top:26px">
        <span class="overline">What the carrier will ask</span>
        <ol class="walk" style="margin-top:12px">
          ${SEND_STEPS.map((s) => `
            <li>
              <b>${esc(s.ask)}</b>
              <span class="small">${esc(s.hint)}</span>
              ${s.key === 'vpa' ? `<button type="button" class="walk-value" data-recopy="${esc(state.vpa)}">${esc(state.vpa)} · copy</button>` : ''}
              ${s.key === 'amount' ? `<span class="walk-value">${esc(String(amount))}</span>` : ''}
              ${s.key === 'note' && note ? `<span class="walk-value">${esc(note)}</span>` : ''}
            </li>`).join('')}
        </ol>
      </div>

      <div class="stack">
        <button type="button" class="btn btn--gold btn--block" data-dial>
          ${icon('dial')} ${canPrefillDialer ? 'Copy ID & open dialer' : `Copy ID & show code`}
        </button>
        ${!knownPayee ? `
          <label class="setting-row" style="border:0;padding:4px 2px">
            <span class="row-main"><b>Save ${esc(state.name || 'this person')} for next time</b></span>
            <span class="switch"><input type="checkbox" data-save-payee checked /><span class="switch-track"></span></span>
          </label>` : ''}
      </div>
      <p class="footnote">Your UPI PIN is typed only in the carrier's own window.<br/>This app never sees or stores it.</p>
    `;

    qs('[data-back]', root).addEventListener('click', () => {
      state.step = 2;
      render();
    });
    root.querySelectorAll('[data-recopy]').forEach((b) =>
      b.addEventListener('click', async () => {
        haptics.tap();
        await copyText(b.dataset.recopy);
        toast('UPI ID copied');
      }));

    qs('[data-dial]', root).addEventListener('click', async () => {
      haptics.confirm();
      const savePayee = qs('[data-save-payee]', root)?.checked;
      if (savePayee) {
        store.addPayee({ name: state.name || state.vpa.split('@')[0], vpa: state.vpa });
      }
      await copyText(state.vpa);

      if (canPrefillDialer) {
        const txn = store.recordPayment({ vpa: state.vpa, name: state.name, amount, note });
        armOutcome(txn.id);
        toast('UPI ID copied. Press call');
        window.location.href = telLink(CODES.sendToVpa.code);
      } else {
        openManualDialSheet(amount, note);
      }
    });

    // Non-Android fallback: show the code, let them start tracking by hand.
    const openManualDialSheet = (amt, nt) => {
      const s = sheet(`
        <h2>Dial this on your phone</h2>
        <p class="sheet-sub">USSD needs a SIM and this device can't prefill the code, so punch it in yourself.</p>
        <div class="qr-card" style="padding:18px 0 8px">
          <div class="mono" style="font-size:2rem;letter-spacing:0.05em">${esc(CODES.sendToVpa.code)}</div>
        </div>
        <div class="stack">
          <button type="button" class="btn btn--primary btn--block" data-track>${icon('check')} I'm dialling, track this payment</button>
          <button type="button" class="btn btn--ghost btn--block" data-close>Cancel</button>
        </div>`);
      qs('[data-track]', s.el).addEventListener('click', () => {
        const txn = store.recordPayment({ vpa: state.vpa, name: state.name, amount: amt, note: nt });
        armOutcome(txn.id);
        s.close();
        navRef.go('home');
        toast('In your ledger as unconfirmed');
      });
    };
  }

  return { onShow };
}

// ---- outcome watcher ---------------------------------------------------------
// Fires when the user comes back from the dialer with a payment in flight.

function armOutcome(txnId) {
  try {
    sessionStorage.setItem(AWAIT_KEY, JSON.stringify({ id: txnId, t: Date.now() }));
  } catch { /* fine, the home nudge covers it */ }
}

function pendingOutcome() {
  try {
    const raw = sessionStorage.getItem(AWAIT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Give the dialer a moment; an instant bounce-back means nothing happened.
    if (Date.now() - parsed.t < 4000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearOutcome() {
  try { sessionStorage.removeItem(AWAIT_KEY); } catch { /* noop */ }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const pending = pendingOutcome();
  if (!pending) return;
  clearOutcome();
  const txn = store.get().history.find((t) => t.id === pending.id);
  if (txn && txn.status === 'unconfirmed') openOutcomeSheet(txn);
});

function openOutcomeSheet(txn) {
  const s = sheet(`
    <h2>How did it go?</h2>
    <p class="sheet-sub">${esc(formatINR(txn.amount))} to ${esc(txn.name || txn.vpa)}. Check the carrier popup or your bank's SMS.</p>
    <div class="stack" style="margin-top:20px" data-choices>
      <button type="button" class="btn btn--primary btn--block" data-ok>${icon('check')} It went through</button>
      <button type="button" class="btn btn--danger btn--block" data-fail>${icon('x')} It failed</button>
      <button type="button" class="btn btn--ghost btn--block" data-close>Not sure yet</button>
      <button type="button" class="linklike small" data-discard style="margin:2px auto 0;color:var(--text-faint);text-transform:none;letter-spacing:0">I never dialled, discard it</button>
    </div>
    <div data-stamped hidden style="text-align:center;padding:26px 0 10px">
      <span class="stamp stamp--sent stamp--big stamp-in">Sent</span>
      <p class="muted small" style="margin-top:18px">Saved to your ledger.</p>
      <label class="field" style="margin-top:16px;text-align:left">
        <span class="field-label">Bank reference no. · optional</span>
        <input class="input input--mono" data-ref type="text" inputmode="numeric" maxlength="30" placeholder="From the confirmation SMS" />
      </label>
      <button type="button" class="btn btn--primary btn--block" data-done style="margin-top:14px">Done</button>
    </div>
  `);

  qs('[data-ok]', s.el).addEventListener('click', () => {
    haptics.confirm();
    store.settlePayment(txn.id, 'sent');
    qs('[data-choices]', s.el).hidden = true;
    qs('[data-stamped]', s.el).hidden = false;
  });
  qs('[data-done]', s.el).addEventListener('click', () => {
    const ref = qs('[data-ref]', s.el).value.trim();
    if (ref) store.settlePayment(txn.id, 'sent', ref);
    s.close();
    navRef?.go('home');
  });
  qs('[data-fail]', s.el).addEventListener('click', () => {
    haptics.warn();
    store.settlePayment(txn.id, 'failed');
    s.close();
    toast('Marked as failed, nothing left your account', { icon: 'x' });
  });
  qs('[data-discard]', s.el).addEventListener('click', () => {
    store.removePayment(txn.id);
    s.close();
  });
}
