/*!
 * Offline UPI
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// Who built this. Kept in one place so the Home footnote and the Guide card
// stay in sync.

import { qs, esc, icon, sheet } from './ui.js';

export const MAKER = {
  name: 'Aayush Gupta',
  tagline: 'Check out my other projects, and get in touch if you would like to hire me.',
  links: [
    { label: 'Portfolio', value: 'aayushguptaportfolio.vercel.app', href: 'https://aayushguptaportfolio.vercel.app' },
    { label: 'LinkedIn', value: 'linkedin.com/in/aayush02', href: 'https://linkedin.com/in/aayush02' },
    { label: 'GitHub', value: 'github.com/AayushXL5', href: 'https://github.com/AayushXL5' },
    { label: 'Email', value: 'aayush.gupta.real@gmail.com', href: 'mailto:aayush.gupta.real@gmail.com' },
    { label: 'Phone', value: '+91 98925 97758', href: 'tel:+919892597758' },
  ],
};

export function openMakerSheet() {
  const s = sheet(`
    <span class="stamp stamp--accent">Open to work</span>
    <h2 style="margin-top:14px">Built by ${esc(MAKER.name)}</h2>
    <p class="sheet-sub">${esc(MAKER.tagline)}</p>
    <div class="rows" style="margin-top:18px">
      ${MAKER.links.map((l) => `
        <a class="row" href="${esc(l.href)}" ${l.href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>
          <span class="row-main">
            <b>${esc(l.label)}</b>
            <span class="small muted">${esc(l.value)}</span>
          </span>
          ${icon('arrow', 'row-go')}
        </a>`).join('')}
    </div>
    <button type="button" class="btn btn--ghost btn--block" data-close style="margin-top:16px">Back to the app</button>
  `);
  return s;
}
