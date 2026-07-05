/*!
 * Offline UPI
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// Small DOM helpers shared by every screen. No framework: template strings
// in, real elements out, and everything user-entered goes through esc().

import { haptics } from './haptics.js';

export const qs = (sel, root = document) => root.querySelector(sel);

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export const icon = (name, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// ---- toast ----------------------------------------------------------------

export function toast(message, { icon: iconName = 'check', action, onAction, sticky } = {}) {
  const root = qs('#toast-root');
  const node = el(`
    <div class="toast" role="status">
      ${iconName ? icon(iconName) : ''}
      <span>${esc(message)}</span>
      ${action ? `<button type="button">${esc(action)}</button>` : ''}
    </div>`);
  if (action) {
    qs('button', node).addEventListener('click', () => {
      onAction?.();
      dismiss();
    });
  }
  root.append(node);
  let gone = false;
  const dismiss = () => {
    if (gone) return;
    gone = true;
    node.classList.add('is-leaving');
    node.addEventListener('animationend', () => node.remove(), { once: true });
  };
  if (!sticky) setTimeout(dismiss, 3200);
  return dismiss;
}

// ---- bottom sheet -----------------------------------------------------------

export function sheet(html, { onClose } = {}) {
  const root = qs('#sheet-root');
  const backdrop = el(`
    <div class="sheet-backdrop">
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="sheet-handle"></div>
        ${html}
      </div>
    </div>`);

  const close = () => {
    if (backdrop.classList.contains('is-closing')) return;
    backdrop.classList.add('is-closing');
    backdrop.addEventListener('animationend', () => {
      backdrop.remove();
      onClose?.();
    }, { once: true });
  };

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelectorAll('[data-close]').forEach((b) =>
    b.addEventListener('click', close));

  root.append(backdrop);
  return { el: backdrop, close };
}

// A yes/no confirmation as a sheet; resolves true only on explicit confirm.
export function confirmSheet({ title, body, confirmLabel = 'Yes, do it', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const s = sheet(`
      <h2>${esc(title)}</h2>
      <p class="sheet-sub">${esc(body)}</p>
      <div class="stack" style="margin-top:20px">
        <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'} btn--block" data-yes>${esc(confirmLabel)}</button>
        <button type="button" class="btn btn--ghost btn--block" data-close>Never mind</button>
      </div>`,
      { onClose: () => { if (!answered) resolve(false); } });
    qs('[data-yes]', s.el).addEventListener('click', () => {
      answered = true;
      haptics.confirm();
      s.close();
      resolve(true);
    });
  });
}

// ---- avatars & names ---------------------------------------------------------

export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
}

export function avatarClass(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.codePointAt(0)) | 0;
  return 'avatar--' + (Math.abs(h) % 6);
}

export function avatarHtml(name, extra = '') {
  return `<span class="avatar ${avatarClass(name)} ${extra}" aria-hidden="true">${esc(initials(name))}</span>`;
}

// ---- dates ---------------------------------------------------------------------

const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

export function fmtTime(ts) { return timeFmt.format(ts); }
export function fmtDateTime(ts) { return `${dateFmt.format(ts)}, ${timeFmt.format(ts)}`; }

export function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return dayFmt.format(d);
}

export const STATUS_META = {
  sent: { label: 'Sent', cls: 'stamp--sent' },
  failed: { label: 'Failed', cls: 'stamp--failed' },
  unconfirmed: { label: 'Unconfirmed', cls: 'stamp--wait' },
};

export function stampHtml(status, extra = '') {
  const meta = STATUS_META[status] ?? STATUS_META.unconfirmed;
  return `<span class="stamp ${meta.cls} ${extra}">${meta.label}</span>`;
}
