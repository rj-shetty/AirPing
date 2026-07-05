// End-to-end walk of the real app inside a lightweight DOM (linkedom): boots
// main.js, then drives onboarding, the pay flow, the ledger, saved people,
// receive, guide and scan, asserting on what actually renders. Catches the
// bugs a syntax check can't: null selectors, broken templates, and throwing
// event handlers.
//
//   npm run test:e2e   (or: node test/app.test.mjs)

import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const { window, document, HTMLElement, CustomEvent, Event } = parseHTML(html);

// ---- browser shims ---------------------------------------------------------
const storageMap = new Map();
const storage = {
  getItem: (k) => storageMap.get(k) ?? null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
};
let hash = '';
const location = {
  get hash() { return hash; },
  set hash(v) { if (hash === v) return; hash = v; window.dispatchEvent(new Event('hashchange')); },
  set href(v) { /* dialer handoff; nothing to do under test */ },
};
const navigatorShim = { onLine: true, userAgent: 'linkedom-test', vibrate: () => {}, clipboard: { writeText: async () => {} } };

Object.defineProperties(globalThis, {
  window: { value: window, configurable: true },
  document: { value: document, configurable: true },
  location: { value: location, configurable: true },
  navigator: { value: navigatorShim, configurable: true },
  localStorage: { value: storage, configurable: true },
  sessionStorage: { value: storage, configurable: true },
  HTMLElement: { value: HTMLElement, configurable: true },
  CustomEvent: { value: CustomEvent, configurable: true },
  requestAnimationFrame: { value: () => 0, configurable: true },
  cancelAnimationFrame: { value: () => {}, configurable: true },
});
for (const [key, value] of Object.entries({ location, scrollTo: () => {}, matchMedia: () => ({ matches: false, addEventListener: () => {} }) })) {
  try { Object.defineProperty(window, key, { value, configurable: true }); } catch { /* linkedom getter */ }
}

let failures = 0;
const ok = (cond, label) => {
  if (cond) console.log('  ok  ', label);
  else { console.log('  FAIL', label); failures++; }
};

// ---- boot ------------------------------------------------------------------
console.log('boot:');
await import(pathToFileURL(join(ROOT, 'js/main.js')).href);
const screen = (n) => document.querySelector(`[data-screen="${n}"]`);

ok(document.querySelector('#app').hasAttribute('hidden') === false, 'app shell revealed');
ok(document.querySelector('#onboarding-root .onboard'), 'onboarding shows on first run');

// ---- onboarding ------------------------------------------------------------
console.log('onboarding:');
document.querySelector('#onboarding-root [data-next]')?.click(); // slide 1 -> 2
document.querySelector('#onboarding-root [data-next]')?.click(); // slide 2 -> 3
const acceptBox = document.querySelector('#onboarding-root [data-accept]');
const letsGo = document.querySelector('#onboarding-root [data-next]');
ok(!!acceptBox, 'acceptance checkbox on final slide');
ok(letsGo?.hasAttribute('disabled'), 'continue is disabled until accepted');
ok(!document.querySelector('#onboarding-root .onboard-accept').textContent.includes('Aayush'), 'author name not in the acceptance line');
document.querySelector('#onboarding-root [data-legal]').click();
const pop = document.querySelector('#onboarding-root .onboard-legal-pop');
ok(!!pop, 'legal popup opens over onboarding');
ok(pop.textContent.includes('non-commercial application'), 'popup shows the legal notice');
ok(!acceptBox.checked, 'tapping the legal link did not tick the box');
pop.querySelector('[data-close]').click();
ok(!document.querySelector('#onboarding-root .onboard-legal-pop'), 'legal popup closes');
letsGo.click();
ok(!!document.querySelector('#onboarding-root .onboard'), 'cannot finish without accepting');
acceptBox.checked = true;
acceptBox.dispatchEvent(new Event('change'));
document.querySelector('#onboarding-root [data-next]').click();
ok(!document.querySelector('#onboarding-root .onboard'), 'finishes once accepted');
ok(storageMap.get('offline-upi:v1')?.includes('acceptedTerms'), 'acceptance recorded in storage');

// ---- home ------------------------------------------------------------------
console.log('home:');
ok(screen('home').classList.contains('is-active'), 'home is the active screen');
ok(screen('home').querySelector('[data-go-pay]'), 'send-money card rendered');
ok(screen('home').textContent.includes('Airtel'), 'carrier strip rendered');
ok(screen('home').querySelector('[data-maker]'), 'maker credit rendered');
ok(screen('home').querySelector('[data-go-legal]'), 'legal link rendered on home');
ok(screen('home').querySelector('[data-install-app]'), 'install action rendered');
ok(document.querySelector('#net-status'), 'status line present in topbar');
ok(document.documentElement.dataset.theme === 'light', 'default theme is light');

document.querySelector('#theme-toggle').click();
ok(document.documentElement.dataset.theme === 'dark', 'toggle switches to dark');
document.querySelector('#theme-toggle').click();
ok(document.documentElement.dataset.theme === 'light', 'toggle switches back to light');

screen('home').querySelector('[data-maker]').click();
const makerSheet = document.querySelector('#sheet-root .sheet');
ok(makerSheet?.textContent.includes('Aayush Gupta'), 'maker sheet shows the name');
ok(makerSheet?.querySelector('a[href*="aayushguptaportfolio"]'), 'portfolio link present');
ok(makerSheet?.querySelector('a[href*="linkedin"]'), 'linkedin link present');
document.querySelector('#sheet-root .sheet-backdrop')?.remove();

// ---- pay flow --------------------------------------------------------------
console.log('pay:');
screen('home').querySelector('[data-go-pay]').click();
ok(screen('pay').classList.contains('is-active'), 'pay screen active after tap');
const vpaInput = screen('pay').querySelector('[data-vpa]');
ok(vpaInput, 'vpa input rendered');
vpaInput.value = 'ramesh@oksbi';
vpaInput.dispatchEvent(new Event('input'));
ok(screen('pay').textContent.includes('Google Pay'), 'provider hint shows for @oksbi');
const next1 = screen('pay').querySelector('[data-next]');
ok(!next1.disabled, 'continue enables on valid vpa');
next1.click();

ok(screen('pay').querySelector('[data-keypad]'), 'keypad rendered on the amount step');
for (const k of ['4', '5', '0']) screen('pay').querySelector(`[data-key="${k}"]`).click();
ok(screen('pay').querySelector('[data-amount]').textContent.includes('450'), 'amount displays 450');
ok(screen('pay').textContent.includes('Four hundred fifty rupees'), 'amount in words renders');
const note = screen('pay').querySelector('[data-note]');
note.value = 'chai';
note.dispatchEvent(new Event('input'));
const next2 = screen('pay').querySelector('[data-next]');
ok(!next2.disabled, 'review enables with a valid amount');
next2.click();

ok(screen('pay').textContent.includes('*99*1*3#'), 'review shows the ussd code');
ok(screen('pay').textContent.includes('ramesh@oksbi'), 'review shows the vpa');
ok(screen('pay').querySelector('[data-dial]'), 'dial button rendered');
screen('pay').querySelector('[data-save-payee]').checked = true; // linkedom needs the property set explicitly
screen('pay').querySelector('[data-dial]').click();
await new Promise((r) => setTimeout(r, 20));
const manualSheet = document.querySelector('#sheet-root .sheet');
ok(manualSheet?.textContent.includes('Dial this on your phone'), 'manual dial sheet opens on non-Android');
manualSheet.querySelector('[data-track]').click();
await new Promise((r) => setTimeout(r, 20));
document.querySelector('#sheet-root .sheet-backdrop')?.remove();

// ---- ledger ----------------------------------------------------------------
console.log('ledger:');
location.hash = '#/history';
ok(screen('history').classList.contains('is-active'), 'history screen active');
ok(screen('history').textContent.includes('Unconfirmed'), 'unconfirmed status visible');
ok(screen('history').textContent.includes('450'), 'amount in the ledger row');
screen('history').querySelector('[data-txn]').click();
const sheet = document.querySelector('#sheet-root .sheet');
ok(sheet, 'detail sheet opens');
ok(sheet.textContent.includes('ramesh@oksbi'), 'sheet shows the vpa');
sheet.querySelector('[data-mark-sent]')?.click();
await new Promise((r) => setTimeout(r, 20));
ok(screen('history').textContent.includes('Sent'), 'entry settles to sent');

// ---- people ----------------------------------------------------------------
console.log('people:');
location.hash = '#/people';
ok(screen('people').textContent.includes('ramesh@oksbi'), 'payee auto-saved from the pay flow');

// ---- receive ---------------------------------------------------------------
console.log('receive:');
location.hash = '#/receive';
const rname = screen('receive').querySelector('[data-name]');
const rvpa = screen('receive').querySelector('[data-vpa]');
ok(rvpa, 'receive setup form rendered');
rname.value = 'Aayush';
rvpa.value = 'aayush@upi';
rvpa.dispatchEvent(new Event('input'));
screen('receive').querySelector('[data-save]').click();
ok(screen('receive').querySelector('.qr-box svg path'), 'QR generated on the device');
ok(screen('receive').textContent.includes('aayush@upi'), 'vpa printed under the QR');

// ---- guide -----------------------------------------------------------------
console.log('guide:');
location.hash = '#/guide';
ok(screen('guide').textContent.includes('Link your bank'), 'setup section rendered');
ok(screen('guide').querySelectorAll('details.faq').length >= 5, 'faqs rendered');
ok(screen('guide').textContent.includes('Legal'), 'legal section present');

// ---- scan (no BarcodeDetector under test -> fallback) -----------------------
console.log('scan:');
location.hash = '#/scan';
ok(screen('scan').textContent.includes("Can't scan here"), 'scanner falls back without BarcodeDetector');

console.log(failures ? `\ne2e: ${failures} FAILURES` : '\ne2e:    all assertions passed');
process.exit(failures ? 1 : 0);
