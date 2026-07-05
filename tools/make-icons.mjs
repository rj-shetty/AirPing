// Generates the app icons from the vector version of the logo mark
// (three QR finder squares + the red SIM, same geometry as the topbar SVG).
// Vector-sourced so every size is crisp and the red matches the app exactly.
//
//   npm i sharp && node tools/make-icons.mjs
//
// sharp is only needed to run this script; the app itself has no dependencies.

import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

const INK = '#111111';
const RED = '#ff3b30';

// The mark spans 4..44 in a 48-unit box.
const MARK = `
  <g fill="none" stroke="${INK}" stroke-width="3.4">
    <rect x="4" y="4" width="14.5" height="14.5" rx="4.4"/>
    <rect x="29.5" y="4" width="14.5" height="14.5" rx="4.4"/>
    <rect x="4" y="29.5" width="14.5" height="14.5" rx="4.4"/>
  </g>
  <g fill="${INK}">
    <rect x="8.9" y="8.9" width="4.7" height="4.7" rx="1.2"/>
    <rect x="34.4" y="8.9" width="4.7" height="4.7" rx="1.2"/>
    <rect x="8.9" y="34.4" width="4.7" height="4.7" rx="1.2"/>
    <rect x="22.4" y="15.6" width="3.4" height="3.4" rx="0.9"/>
    <rect x="17.2" y="21.2" width="3.4" height="3.4" rx="0.9"/>
    <rect x="22.4" y="21.2" width="3.4" height="3.4" rx="0.9"/>
    <rect x="22.4" y="26.8" width="3.4" height="3.4" rx="0.9"/>
  </g>
  <path fill="${RED}" d="M33.4 28.5h7.6a3.5 3.5 0 0 1 3.5 3.5v8.5a3.5 3.5 0 0 1-3.5 3.5H32a3.5 3.5 0 0 1-3.5-3.5v-7.1a4.9 4.9 0 0 1 4.9-4.9z"/>
  <rect x="33.1" y="33.4" width="6.8" height="6.2" rx="1.5" fill="#fff"/>
  <rect x="35.9" y="33.4" width="1.2" height="6.2" fill="${RED}"/>
  <rect x="33.1" y="36" width="6.8" height="1.1" fill="${RED}"/>`;

// `scale` is how much of the canvas the 48-unit mark box occupies.
function iconSvg(scale) {
  const s = 48 * scale;
  const offset = (48 - s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <rect width="48" height="48" fill="#ffffff"/>
    <g transform="translate(${offset} ${offset}) scale(${scale})">${MARK}</g>
  </svg>`;
}

async function render(name, size, scale) {
  await sharp(Buffer.from(iconSvg(scale)), { density: 300 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, name));
  console.log(name, size);
}

await render('icon-192.png', 192, 0.92);
await render('icon-512.png', 512, 0.92);
await render('maskable-192.png', 192, 0.72);
await render('maskable-512.png', 512, 0.72);
await render('apple-touch-icon.png', 180, 0.84);

// favicon: same mark, kept as a real vector
writeFileSync(join(OUT, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="10" fill="#ffffff"/>
  <g transform="translate(2.4 2.4) scale(0.9)">${MARK}</g>
</svg>\n`);
console.log('favicon.svg');
