/*!
 * Offline UPI
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// The ledger. Everything stays on this device; each entry keeps the honest
// status the user gave it: sent, failed, or still unconfirmed.

import { store } from '../store.js';
import { formatINR, groupIndian } from '../upi.js';
import {
  qs, esc, icon, sheet, toast, avatarHtml, stampHtml, dayLabel, fmtTime,
  fmtDateTime, confirmSheet, STATUS_META,
} from '../ui.js';
import { haptics } from '../haptics.js';

export function initHistory(root, { nav }) {
  function render() {
    const { history } = store.get();

    if (!history.length) {
      root.innerHTML = `
        <h1 class="screen-title">Ledger</h1>
        <div class="empty">
          <div class="empty-mark"><svg viewBox="0 0 48 48"><use href="#i-mark"/></svg></div>
          <h3>Nothing written yet</h3>
          <p>Payments you start here get recorded on this page. They never leave your phone.</p>
          <button type="button" class="btn btn--primary" data-go-pay>Send your first ₹</button>
        </div>`;
      qs('[data-go-pay]', root).addEventListener('click', () => nav.go('pay'));
      return;
    }

    const groups = [];
    for (const txn of history) {
      const label = dayLabel(txn.at);
      if (!groups.length || groups.at(-1).label !== label) groups.push({ label, items: [] });
      groups.at(-1).items.push(txn);
    }

    // A single honest number, computed from what the user confirmed.
    const now = new Date();
    const monthTotal = history
      .filter((t) => t.status === 'sent' &&
        new Date(t.at).getMonth() === now.getMonth() &&
        new Date(t.at).getFullYear() === now.getFullYear())
      .reduce((sum, t) => sum + t.amount, 0);
    const monthName = new Intl.DateTimeFormat('en-IN', { month: 'long' }).format(now);

    root.innerHTML = `
      <h1 class="screen-title">Ledger</h1>
      ${monthTotal > 0 ? `<p class="small muted" style="margin-top:6px;font-weight:600">${esc(formatINR(monthTotal))} sent in ${esc(monthName)}</p>` : ''}
      ${groups.map((g) => `
        <div class="date-label overline">${esc(g.label)}</div>
        <div class="rows">
          ${g.items.map((t) => `
            <button type="button" class="row" data-txn="${esc(t.id)}">
              ${avatarHtml(t.name || t.vpa)}
              <span class="row-main">
                <b>${esc(t.name || t.vpa)}</b>
                <span class="small muted">${esc(fmtTime(t.at))}${t.note ? ` · ${esc(t.note)}` : ''}</span>
              </span>
              <span class="row-side">
                <span class="row-amount">− ${esc(formatINR(t.amount))}</span><br/>
                ${stampHtml(t.status)}
              </span>
            </button>`).join('')}
        </div>`).join('')}
    `;

    root.querySelectorAll('[data-txn]').forEach((row) =>
      row.addEventListener('click', () => {
        const txn = store.get().history.find((t) => t.id === row.dataset.txn);
        if (txn) openDetail(txn);
      }));
  }

  function openDetail(txn) {
    const meta = STATUS_META[txn.status];
    const s = sheet(`
      <div class="receipt" style="margin-top:8px">
        <span class="receipt-stamp-slot">${stampHtml(txn.status)}</span>
        <div class="receipt-head">
          <span class="overline">${txn.status === 'failed' ? 'Attempted' : 'Paid'}</span>
          <div class="receipt-amount"><span class="rupee">₹</span>${esc(groupIndian(String(txn.amount)))}</div>
        </div>
        <div class="tear"></div>
        <dl class="receipt-lines">
          <div class="receipt-line"><dt>To</dt><dd>${esc(txn.name || txn.vpa.split('@')[0])}</dd></div>
          <div class="receipt-line"><dt>UPI ID</dt><dd class="mono">${esc(txn.vpa)}</dd></div>
          ${txn.note ? `<div class="receipt-line"><dt>Note</dt><dd>${esc(txn.note)}</dd></div>` : ''}
          <div class="receipt-line"><dt>When</dt><dd>${esc(fmtDateTime(txn.at))}</dd></div>
          ${txn.ref ? `<div class="receipt-line"><dt>Bank ref</dt><dd class="mono">${esc(txn.ref)}</dd></div>` : ''}
          <div class="receipt-line"><dt>Status</dt><dd>${esc(meta.label)}</dd></div>
        </dl>
      </div>

      ${txn.status === 'unconfirmed' ? `
        <div class="duo" style="margin-top:16px">
          <button type="button" class="btn btn--primary" data-mark-sent>${icon('check')} Went through</button>
          <button type="button" class="btn btn--danger" data-mark-failed>${icon('x')} It failed</button>
        </div>` : ''}

      <div class="stack" style="margin-top:14px">
        <button type="button" class="btn btn--ghost btn--block" data-again>${icon('dial')} Pay again</button>
        <button type="button" class="linklike small" data-delete style="margin:4px auto 0;color:var(--red)">Remove this entry</button>
      </div>
    `);

    qs('[data-mark-sent]', s.el)?.addEventListener('click', () => {
      haptics.confirm();
      store.settlePayment(txn.id, 'sent');
      s.close();
      toast('Stamped as sent');
    });
    qs('[data-mark-failed]', s.el)?.addEventListener('click', () => {
      haptics.warn();
      store.settlePayment(txn.id, 'failed');
      s.close();
      toast('Marked as failed', { icon: 'x' });
    });
    qs('[data-again]', s.el).addEventListener('click', () => {
      s.close();
      nav.go('pay', { vpa: txn.vpa, name: txn.name, amount: txn.amount, note: txn.note });
    });
    qs('[data-delete]', s.el).addEventListener('click', async () => {
      s.close();
      const yes = await confirmSheet({
        title: 'Remove this entry?',
        body: 'Only the record disappears. This cannot undo a real payment.',
        confirmLabel: 'Remove it',
        danger: true,
      });
      if (yes) {
        store.removePayment(txn.id);
        toast('Entry removed');
      }
    });
  }

  store.subscribe(() => {
    if (root.classList.contains('is-active')) render();
  });

  return { onShow: render };
}
