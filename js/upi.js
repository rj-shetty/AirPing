/*!
 * AirPing
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// UPI primitives: VPA validation, upi:// deep links, and Indian-style
// money formatting. Pure functions only; this module never touches the DOM.

const VPA_RE = /^[a-z0-9][a-z0-9._-]{0,48}@[a-z][a-z0-9]{1,63}$/i;

// The handles people actually have. Used purely as a "looks right" hint
// under the input; unknown handles are still accepted.
const KNOWN_HANDLES = {
  ybl: 'PhonePe', ibl: 'PhonePe', axl: 'PhonePe',
  okhdfcbank: 'Google Pay', okicici: 'Google Pay', oksbi: 'Google Pay', okaxis: 'Google Pay',
  paytm: 'Paytm', ptyes: 'Paytm', ptsbi: 'Paytm', pthdfc: 'Paytm', ptaxis: 'Paytm',
  upi: 'BHIM', sbi: 'SBI Pay', uboi: 'Union Bank', cnrb: 'Canara Bank',
  pnb: 'PNB', boi: 'Bank of India', barodampay: 'Bank of Baroda',
  federal: 'Federal Bank', fbl: 'Federal Bank', kotak: 'Kotak', kmbl: 'Kotak',
  icici: 'ICICI', hdfcbank: 'HDFC Bank', axisbank: 'Axis Bank', yesbank: 'Yes Bank',
  idbi: 'IDBI Bank', indus: 'IndusInd', airtel: 'Airtel Payments Bank',
  apl: 'Amazon Pay', yapl: 'Amazon Pay', rapl: 'Amazon Pay',
  jupiteraxis: 'Jupiter', fam: 'FamPay', slice: 'slice', naviaxis: 'Navi',
  superyes: 'super.money', axb: 'super.money',
};

export function isValidVpa(value) {
  return VPA_RE.test(String(value ?? '').trim());
}

export function vpaProvider(vpa) {
  const handle = String(vpa).split('@')[1]?.toLowerCase();
  return handle ? KNOWN_HANDLES[handle] ?? null : null;
}

// ---- amounts ----------------------------------------------------------

// *99# caps a single transfer at ₹5,000 (NPCI rule for USSD UPI).
export const MAX_AMOUNT = 5000;
export const MIN_AMOUNT = 1;

export function parseAmount(text) {
  const clean = String(text ?? '').replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

export function amountIssue(value) {
  if (value == null) return 'Enter a valid amount.';
  if (value < MIN_AMOUNT) return `Minimum is ₹${MIN_AMOUNT}.`;
  if (value > MAX_AMOUNT) return `*99# allows up to ₹${MAX_AMOUNT.toLocaleString('en-IN')} per transfer.`;
  return null;
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function formatINR(value) {
  return '₹' + inr.format(value);
}

// Lakh/crore digit grouping, e.g. "123456" → "1,23,456". Accepts a plain
// number string, with or without decimals.
export function groupIndian(numStr) {
  const [whole = '', frac] = String(numStr).split('.');
  let grouped = whole;
  if (whole.length > 3) {
    const last3 = whole.slice(-3);
    grouped = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return frac !== undefined ? grouped + '.' + frac : grouped;
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function below100(n) {
  if (n < 20) return ONES[n];
  return (TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''));
}

function below1000(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let out = h ? ONES[h] + ' hundred' : '';
  if (rest) out += (out ? ' ' : '') + below100(rest);
  return out;
}

// Indian numbering: crore, lakh, thousand.
export function amountInWords(value) {
  if (value == null || value <= 0) return '';
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);
  const parts = [];
  const crore = Math.floor(rupees / 1e7);
  const lakh = Math.floor((rupees % 1e7) / 1e5);
  const thousand = Math.floor((rupees % 1e5) / 1000);
  const rest = rupees % 1000;
  if (crore) parts.push(below100(crore) + ' crore');
  if (lakh) parts.push(below100(lakh) + ' lakh');
  if (thousand) parts.push(below100(thousand) + ' thousand');
  if (rest) parts.push(below1000(rest));
  let words = parts.join(' ') || 'zero';
  words += rupees === 1 ? ' rupee' : ' rupees';
  if (paise) words += ` and ${below100(paise)} paise`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ---- upi:// deep links -------------------------------------------------

// Parses the payment QR format used across UPI: upi://pay?pa=…&pn=…&am=…
// Returns null unless there is a plausible payee address.
export function parseUpiUri(text) {
  const raw = String(text ?? '').trim();
  const m = raw.match(/^(?:upi:\/\/|upi:)pay\??/i);
  if (!m) return null;
  const query = raw.slice(m[0].length);
  // Some QR printers uppercase the keys; normalise before reading.
  const params = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(query)) params.append(key.toLowerCase(), value);
  const pa = (params.get('pa') ?? '').trim();
  if (!isValidVpa(pa)) return null;
  const amRaw = (params.get('am') ?? '').trim();
  const amount = amRaw ? parseAmount(amRaw) : null;
  return {
    vpa: pa,
    name: (params.get('pn') ?? '').trim() || null,
    amount: amount && amount > 0 ? amount : null,
    note: (params.get('tn') ?? '').trim() || null,
  };
}

export function buildUpiUri({ vpa, name, amount, note }) {
  const params = new URLSearchParams();
  params.set('pa', vpa);
  if (name) params.set('pn', name);
  if (amount) params.set('am', amount.toFixed(2));
  if (note) params.set('tn', note);
  params.set('cu', 'INR');
  return 'upi://pay?' + params.toString();
}
