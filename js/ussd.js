/*!
 * Offline UPI
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// Everything about the *99# channel itself: the code catalogue, dialer
// deep links, and what we know about carrier support.

export const CODES = {
  menu:      { code: '*99#',      label: 'Full BHIM menu' },
  sendToVpa: { code: '*99*1*3#',  label: 'Send to a UPI ID' },
  balance:   { code: '*99*3#',    label: 'Check balance' },
  upiPin:    { code: '*99*4#',    label: 'Set / change UPI PIN' },
};

// The dialer accepts tel: links with the code prefilled; '#' has to be
// percent-encoded or the dialer truncates the string.
export function telLink(code) {
  return 'tel:' + encodeURIComponent(code);
}

export function dial(code) {
  window.location.href = telLink(code);
}

// USSD runs on the GSM voice channel, so support is a property of the
// carrier, not the phone.
export const CARRIERS = [
  { name: 'Airtel', works: true },
  { name: 'Vi (Vodafone Idea)', works: true },
  { name: 'BSNL', works: true },
  { name: 'Jio', works: false, why: 'VoLTE-only network; Jio never wired up *99#.' },
];

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
export const isAndroid = /android/i.test(ua);
export const isIOS = /iphone|ipad|ipod/i.test(ua);

// iOS refuses tel: links that contain * or # (an old anti-fraud rule),
// so there the app can only show the code for hand-dialling.
export const canPrefillDialer = isAndroid;

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context; fall back to the old trick.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

// The prompts the carrier will walk through after dialling *99*1*3#.
// Kept as data so the walkthrough screen can render and tick them off.
export const SEND_STEPS = [
  { ask: 'Enter payee UPI ID', hint: 'Long-press the box and paste. It is already on your clipboard.', key: 'vpa' },
  { ask: 'Enter amount', hint: 'Type the number only, no ₹ sign.', key: 'amount' },
  { ask: 'Enter remarks', hint: 'Keep it to a word or two, like rent or chai.', key: 'note' },
  { ask: 'Enter your UPI PIN', hint: 'The same PIN you use in any UPI app. We never see it.', key: 'pin' },
];
