// Unit tests for the pure logic modules. No dependencies, no browser.
//
//   npm run test:logic   (or: node test/logic.test.mjs)

import {
  isValidVpa, vpaProvider, parseAmount, amountIssue, groupIndian,
  amountInWords, parseUpiUri, buildUpiUri, MAX_AMOUNT,
} from '../js/upi.js';
import { makeQR } from '../js/qr.js';
import { telLink, CODES } from '../js/ussd.js';

let passed = 0;
const failures = [];

function is(actual, expected, label) {
  const okay = JSON.stringify(actual) === JSON.stringify(expected);
  if (okay) passed++;
  else failures.push(`${label}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

// ---- VPA validation --------------------------------------------------------

is(isValidVpa('ramesh@oksbi'), true, 'plain vpa is valid');
is(isValidVpa('a.b-c_d@ybl'), true, 'dots, dashes, underscores allowed');
is(isValidVpa('9876543210@paytm'), true, 'numeric local part allowed');
is(isValidVpa('UPPER@OKICICI'), true, 'case-insensitive');
is(isValidVpa('@ybl'), false, 'missing local part rejected');
is(isValidVpa('name@'), false, 'missing handle rejected');
is(isValidVpa('name@@ybl'), false, 'double @ rejected');
is(isValidVpa('name ybl'), false, 'no @ rejected');
is(isValidVpa('na me@ybl'), false, 'space rejected');
is(isValidVpa(''), false, 'empty rejected');
is(isValidVpa(null), false, 'null rejected');

is(vpaProvider('x@ybl'), 'PhonePe', 'ybl maps to PhonePe');
is(vpaProvider('x@oksbi'), 'Google Pay', 'oksbi maps to Google Pay');
is(vpaProvider('x@unknownhandle'), null, 'unknown handle maps to null');

// ---- amounts ----------------------------------------------------------------

is(parseAmount('450'), 450, 'plain integer');
is(parseAmount('₹1,250.50'), 1250.5, 'symbols and commas stripped');
is(parseAmount('0.99'), 0.99, 'sub-rupee parses');
is(parseAmount('1.234'), null, 'three decimals rejected');
is(parseAmount('12a'), null, 'letters rejected');
is(parseAmount(''), null, 'empty rejected');

is(amountIssue(500), null, 'in-range amount is fine');
is(amountIssue(0.5), 'Minimum is ₹1.', 'below minimum flagged');
is(amountIssue(MAX_AMOUNT), null, 'exactly the cap is fine');
is(typeof amountIssue(5001), 'string', 'above cap flagged');

is(groupIndian('500'), '500', 'no grouping under 1000');
is(groupIndian('1000'), '1,000', 'thousands');
is(groupIndian('123456'), '1,23,456', 'lakh grouping');
is(groupIndian('12345678'), '1,23,45,678', 'crore grouping');
is(groupIndian('150.5'), '150.5', 'decimals preserved');
is(groupIndian('123456.75'), '1,23,456.75', 'grouping with decimals');

is(amountInWords(1), 'One rupee', 'singular rupee');
is(amountInWords(21), 'Twenty-one rupees', 'hyphenated tens');
is(amountInWords(105), 'One hundred five rupees', 'hundreds');
is(amountInWords(5000), 'Five thousand rupees', 'thousands');
is(amountInWords(150000), 'One lakh fifty thousand rupees', 'lakh');
is(amountInWords(10000000), 'One crore rupees', 'crore');
is(amountInWords(2.5), 'Two rupees and fifty paise', 'paise');

// ---- upi:// URIs -----------------------------------------------------------

is(parseUpiUri('upi://pay?pa=ramesh@oksbi&pn=Ramesh&am=450.00&tn=chai'),
  { vpa: 'ramesh@oksbi', name: 'Ramesh', amount: 450, note: 'chai' },
  'full uri parses');
is(parseUpiUri('upi://pay?pa=x@ybl'),
  { vpa: 'x@ybl', name: null, amount: null, note: null },
  'minimal uri parses');
is(parseUpiUri('UPI://PAY?PA=shop@icici&AM=99'),
  { vpa: 'shop@icici', name: null, amount: 99, note: null },
  'uppercase scheme and keys tolerated');
is(parseUpiUri('upi://pay?pa=shop@icici&pn=Tea%20Stall'),
  { vpa: 'shop@icici', name: 'Tea Stall', amount: null, note: null },
  'percent-encoded name decodes');
is(parseUpiUri('upi://pay?pa=notavpa'), null, 'invalid payee returns null');
is(parseUpiUri('https://example.com'), null, 'non-upi uri returns null');
is(parseUpiUri('upi://pay?pa=x@ybl&am=-5'),
  { vpa: 'x@ybl', name: null, amount: null, note: null },
  'negative amount ignored');

const roundTrip = parseUpiUri(buildUpiUri({ vpa: 'me@upi', name: 'Me & Co', amount: 1250.5, note: 'a/b test' }));
is(roundTrip, { vpa: 'me@upi', name: 'Me & Co', amount: 1250.5, note: 'a/b test' },
  'build then parse round-trips awkward characters');

// ---- ussd ------------------------------------------------------------------

is(telLink('*99#'), 'tel:*99%23', 'hash is percent-encoded for the dialer');
is(telLink(CODES.sendToVpa.code), 'tel:*99*1*3%23', 'send code encodes');

// ---- QR structural checks --------------------------------------------------

{
  const qr = makeQR('upi://pay?pa=someone@oksbi&am=450.00&cu=INR');
  is(qr.size, qr.version * 4 + 17, 'matrix size matches version');
  is(qr.modules.length, qr.size, 'row count matches size');
  is(qr.modules[0][0], 1, 'top-left finder corner dark');
  is(qr.modules[0][qr.size - 1], 1, 'top-right finder corner dark');
  is(qr.modules[qr.size - 1][0], 1, 'bottom-left finder corner dark');
  is(qr.modules[qr.size - 8][8], 1, 'always-dark module set');

  const tiny = makeQR('x');
  is(tiny.version, 1, 'one byte fits version 1');
  const big = makeQR('y'.repeat(213));
  is(big.version, 10, '213 bytes lands in version 10');
  let threw = false;
  try { makeQR('z'.repeat(214)); } catch { threw = true; }
  is(threw, true, 'oversized input throws');
}

// ---- report ----------------------------------------------------------------

if (failures.length) {
  console.error(`\n${failures.length} FAILED, ${passed} passed\n`);
  for (const f of failures) console.error('  x ' + f + '\n');
  process.exit(1);
}
console.log(`logic:  all ${passed} tests passed`);
