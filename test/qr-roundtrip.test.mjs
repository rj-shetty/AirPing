// Verifies the from-scratch QR encoder by generating codes, rasterising them,
// and decoding them back with jsQR (an independent decoder). If jsQR reads the
// exact input across every version boundary and a fuzz sweep, the encoder is
// correct.
//
//   npm run test:qr   (or: node test/qr-roundtrip.test.mjs)

import { createRequire } from 'node:module';
import { makeQR } from '../js/qr.js';

const require = createRequire(import.meta.url);
const jsQR = require('jsqr');

function rasterize(qr, scale = 4, quiet = 4) {
  const dim = (qr.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y][x]) continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = ((y + quiet) * scale + sy) * dim + (x + quiet) * scale + sx;
          data[px * 4] = data[px * 4 + 1] = data[px * 4 + 2] = 0;
        }
      }
    }
  }
  return { data, width: dim, height: dim };
}

let pass = 0;
const fails = [];

function check(text, label) {
  const qr = makeQR(text);
  const img = rasterize(qr);
  const decoded = jsQR(img.data, img.width, img.height);
  if (decoded && decoded.data === text) pass++;
  else fails.push(`[v${qr.version} mask${qr.mask}] ${label}: got ${decoded ? JSON.stringify(decoded.data.slice(0, 60)) : 'null'}`);
}

check('hello', 'tiny');
check('upi://pay?pa=someone%40oksbi&pn=Someone&am=450.00&cu=INR', 'typical upi uri');
check('upi://pay?pa=a.very.long.merchant.handle@icici&pn=Some%20Merchant%20Name%20Pvt%20Ltd&am=4999.99&tn=Invoice%20N0.%2012345&cu=INR', 'long upi uri');

// every capacity boundary for versions 1..10
const rand = (n) => Array.from({ length: n }, () => String.fromCharCode(33 + Math.floor(Math.random() * 94))).join('');
for (const n of [1, 7, 13, 14, 15, 26, 27, 42, 43, 62, 63, 84, 85, 106, 107, 122, 123, 152, 153, 180, 181, 200, 213]) {
  check(rand(n), `boundary length ${n}`);
}
for (let i = 0; i < 60; i++) {
  const n = 1 + Math.floor(Math.random() * 213);
  check(rand(n), `fuzz length ${n}`);
}
check('₹500 to राहुल@upi', 'utf-8 multibyte');

if (fails.length) {
  console.error(`\nqr: ${fails.length} FAILED, ${pass} passed\n`);
  for (const f of fails) console.error('  x ' + f);
  process.exit(1);
}
console.log(`qr:     all ${pass} round-trips passed`);
