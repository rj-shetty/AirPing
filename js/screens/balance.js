/*!
 * AirPing
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// Balance check is a two-prompt USSD session, small enough to live in a
// sheet instead of a whole screen.

import { CODES, dial, canPrefillDialer, copyText } from '../ussd.js';
import { qs, esc, icon, sheet, toast } from '../ui.js';
import { haptics } from '../haptics.js';

export function openBalanceSheet() {
  const code = CODES.balance.code;
  const s = sheet(`
    <h2>Check balance</h2>
    <p class="sheet-sub">Straight from your bank, over the voice channel.</p>
    <ol class="walk" style="margin-top:20px">
      <li><b>We open your dialer with <span class="mono">${esc(code)}</span> typed in</b><span class="small">Just press the call button.</span></li>
      <li><b>Enter your UPI PIN when asked</b><span class="small">Your balance appears right in the carrier's popup.</span></li>
    </ol>
    ${canPrefillDialer
      ? `<button type="button" class="btn btn--gold btn--block" data-dial>${icon('dial')} Open dialer</button>`
      : `<button type="button" class="btn btn--gold btn--block" data-copy>${icon('copy')} Copy ${esc(code)}</button>
         <p class="small muted" style="margin-top:10px;text-align:center">This device can't prefill USSD codes. Dial it yourself from any phone with a SIM.</p>`}
  `);

  qs('[data-dial]', s.el)?.addEventListener('click', () => {
    haptics.confirm();
    s.close();
    dial(code);
  });
  qs('[data-copy]', s.el)?.addEventListener('click', async () => {
    haptics.tap();
    const ok = await copyText(code);
    toast(ok ? `${code} copied` : 'Could not copy, dial it manually', { icon: ok ? 'check' : 'x' });
  });
}
