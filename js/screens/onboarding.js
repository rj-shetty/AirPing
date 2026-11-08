/*!
 * AirPing
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// First-run walkthrough. Three slides, and a light acceptance step on the
// last one so every user has actively agreed to the terms before entering.

import { store } from '../store.js';
import { qs, el, icon } from '../ui.js';
import { haptics } from '../haptics.js';
import { legalHtml } from '../legal.js';

const SLIDES = [
  {
    art: `<div class="onboard-art onboard-art--logo">${icon('mark')}</div>`,
    title: 'UPI, when the internet <em>isn’t there</em>.',
    body: '*99# service sends money over the same signal that carries your calls. No data pack, no Wi-Fi. Just your SIM and your UPI PIN.',
  },
  {
    art: `<div class="onboard-art">${icon('dial')}</div>`,
    title: 'You dial, <em>we do the fiddly bits</em>.',
    body: 'Typing UPI IDs into a USSD box is miserable. Build the payment here instead: we copy the ID, prefill the code, and rehearse every prompt with you.',
  },
  {
    art: `<div class="onboard-art">${icon('shield')}</div>`,
    title: 'Yours, and <em>only yours</em>.',
    body: 'No account. No server. Your PIN stays in the carrier’s window and your records stay on this phone. Works on Airtel, Vi and BSNL SIMs. *99# does not work for Jio users.',
  },
];

export function maybeShowOnboarding() {
  if (store.get().settings.onboarded) return;

  const root = qs('#onboarding-root');
  let index = 0;
  let accepted = false;

  function render() {
    const last = index === SLIDES.length - 1;
    root.innerHTML = `
      <div class="onboard" role="dialog" aria-label="Welcome">
        <div class="onboard-slides">
          ${SLIDES.map((s, i) => `
            <div class="onboard-slide ${i === index ? 'is-active' : ''}">
              ${s.art}
              <h2>${s.title}</h2>
              <p>${s.body}</p>
              ${i === SLIDES.length - 1 ? `
                <label class="onboard-accept">
                  <input type="checkbox" data-accept ${accepted ? 'checked' : ''} />
                  <span class="onboard-accept-box">${icon('check')}</span>
                  <span>I agree to the <button type="button" class="onboard-legal-link" data-legal>terms &amp; legal notice</button>.</span>
                </label>` : ''}
            </div>`).join('')}
        </div>
        <div class="onboard-foot">
          <div class="dots">${SLIDES.map((_, i) => `<i class="${i === index ? 'is-on' : ''}"></i>`).join('')}</div>
          ${last
            ? `<button type="button" class="btn btn--gold" data-next ${accepted ? '' : 'disabled'}>Let’s go ${icon('arrow')}</button>`
            : `<button type="button" class="onboard-skip" data-skip>Skip</button>
               <button type="button" class="btn btn--primary" data-next>Next ${icon('arrow')}</button>`}
        </div>
      </div>`;

    const nextBtn = qs('[data-next]', root);
    nextBtn.addEventListener('click', () => {
      if (nextBtn.disabled) return;
      haptics.tap();
      if (last) finish();
      else {
        index++;
        render();
      }
    });

    // Skip jumps to the final slide (the acceptance step), never past it.
    qs('[data-skip]', root)?.addEventListener('click', () => {
      haptics.tap();
      index = SLIDES.length - 1;
      render();
    });

    const accept = qs('[data-accept]', root);
    accept?.addEventListener('change', (e) => {
      accepted = e.target.checked;
      nextBtn.disabled = !accepted;
      if (accepted) haptics.tap();
    });

    // The legal link sits inside the label; keep the tap from toggling the box.
    qs('[data-legal]', root)?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      haptics.tap();
      openLegalPopup();
    });
  }

  // A self-contained popup that floats above the onboarding overlay, so users
  // can read the terms and close straight back to the checkbox.
  function openLegalPopup() {
    const pop = el(`
      <div class="onboard-legal-pop">
        <div class="onboard-legal-card" role="dialog" aria-modal="true" aria-label="Terms and legal notice">
          <div class="onboard-legal-head">
            <span class="overline">Terms &amp; legal notice</span>
            <button type="button" class="iconbtn" data-close aria-label="Close">${icon('x')}</button>
          </div>
          <div class="legal-text">${legalHtml()}</div>
          <button type="button" class="btn btn--primary btn--block" data-close style="margin-top:18px">Close</button>
        </div>
      </div>`);
    const close = () => pop.remove();
    pop.addEventListener('click', (e) => { if (e.target === pop) close(); });
    pop.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    root.append(pop);
  }

  function finish() {
    store.patchSettings({ onboarded: true, acceptedTerms: true, acceptedAt: Date.now() });
    root.innerHTML = '';
  }

  render();
}
