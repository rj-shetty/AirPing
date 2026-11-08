/*!
 * AirPing
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// A small QR encoder, written from scratch against ISO/IEC 18004.
// Byte mode, error-correction level M, versions 1 to 10. More than enough
// headroom for a upi://pay URI. No dependencies, works offline like
// everything else here.
//
// Pipeline: bytes → bit stream (+padding) → Reed-Solomon blocks →
// interleave → matrix → best of the 8 masks by penalty score.

// ---- GF(256) arithmetic for Reed-Solomon ------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // the QR primitive polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

// Generator polynomial of the requested degree, built up as
// (x - α^0)(x - α^1)…(x - α^(n-1)).
function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly.reverse(); // highest power first
}

function rsRemainder(data, degree) {
  const gen = rsGenerator(degree);
  const rem = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.copyWithin(0, 1);
    rem[degree - 1] = 0;
    for (let i = 0; i < degree; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

// ---- version tables (error-correction level M only) --------------------

// [byte-mode capacity, ec codewords per block, [count, dataCodewords]…]
const VERSIONS = [
  [14, 10, [1, 16]],
  [26, 16, [1, 28]],
  [42, 26, [1, 44]],
  [62, 18, [2, 32]],
  [84, 24, [2, 43]],
  [106, 16, [4, 27]],
  [122, 18, [4, 31]],
  [152, 22, [2, 38], [2, 39]],
  [180, 22, [3, 36], [2, 37]],
  [213, 26, [4, 43], [1, 44]],
];

function alignmentPositions(version) {
  if (version === 1) return [];
  const size = version * 4 + 17;
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 :
    Math.ceil((size - 13) / (count * 2 - 2)) * 2;
  const positions = [6];
  for (let pos = size - 7; positions.length < count; pos -= step) positions.splice(1, 0, pos);
  return positions;
}

// ---- bit stream ---------------------------------------------------------

class BitBuffer {
  constructor() { this.bits = []; }
  push(value, length) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length() { return this.bits.length; }
}

function buildCodewords(bytes, versionIndex) {
  const [, ecPerBlock, ...groups] = VERSIONS[versionIndex];
  const dataCapacity = groups.reduce((sum, [n, k]) => sum + n * k, 0);

  const bb = new BitBuffer();
  bb.push(0b0100, 4); // byte mode
  bb.push(bytes.length, versionIndex + 1 <= 9 ? 8 : 16);
  for (const b of bytes) bb.push(b, 8);

  const capacityBits = dataCapacity * 8;
  bb.push(0, Math.min(4, capacityBits - bb.length)); // terminator
  if (bb.length % 8) bb.push(0, 8 - (bb.length % 8));

  const data = [];
  for (let i = 0; i < bb.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bb.bits[i + j];
    data.push(byte);
  }
  for (let pad = 0xec; data.length < dataCapacity; pad ^= 0xfd) data.push(pad);

  // Split into blocks, then interleave data and EC codewords.
  const blocks = [];
  let offset = 0;
  for (const [count, k] of groups) {
    for (let i = 0; i < count; i++) {
      const chunk = data.slice(offset, offset + k);
      blocks.push({ data: chunk, ec: rsRemainder(chunk, ecPerBlock) });
      offset += k;
    }
  }
  const out = [];
  const maxLen = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxLen; i++)
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ecPerBlock; i++)
    for (const b of blocks) out.push(b.ec[i]);
  return out;
}

// ---- matrix -------------------------------------------------------------

function makeMatrix(version) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Uint8Array(size));
  const isFunction = Array.from({ length: size }, () => new Uint8Array(size));

  const set = (x, y, dark) => {
    modules[y][x] = dark ? 1 : 0;
    isFunction[y][x] = 1;
  };

  // Finder patterns with separators, at three corners.
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    set(i, 6, i % 2 === 0);
    set(6, i, i % 2 === 0);
  }

  // Alignment patterns (skip the three that collide with finders).
  const positions = alignmentPositions(version);
  for (const cy of positions) {
    for (const cx of positions) {
      const nearFinder =
        (cx <= 8 && cy <= 8) || (cx >= size - 9 && cy <= 8) || (cx <= 8 && cy >= size - 9);
      if (nearFinder) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  // Reserve the format-info areas (rewritten per mask later).
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) { set(8, i, false); set(i, 8, false); }
    if (i < 8) { set(size - 1 - i, 8, false); set(8, size - 1 - i, false); }
  }
  set(8, size - 8, true); // the module that is always dark

  // Version info blocks, only for version 7+.
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit);
      set(b, a, bit);
    }
  }

  return { size, modules, isFunction };
}

function placeData(m, codewords) {
  const { size, modules, isFunction } = m;
  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  // Zigzag: column pairs right to left, alternating up/down, skipping the
  // vertical timing column.
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (isFunction[y][x]) continue;
        let dark = false;
        if (bitIndex < totalBits) {
          dark = ((codewords[bitIndex >> 3] >>> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex++;
        }
        modules[y][x] = dark ? 1 : 0;
      }
    }
  }
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(m, mask) {
  const { size, modules, isFunction } = m;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (!isFunction[y][x] && MASKS[mask](x, y)) modules[y][x] ^= 1;
}

function drawFormatBits(m, mask) {
  const { size, modules } = m;
  // EC level M has format bits 00; append the 10 BCH bits, then XOR
  // with the spec's fixed pattern.
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i) => (bits >>> i) & 1;

  for (let i = 0; i <= 5; i++) modules[i][8] = bit(i);
  modules[7][8] = bit(6);
  modules[8][8] = bit(7);
  modules[8][7] = bit(8);
  for (let i = 9; i < 15; i++) modules[8][14 - i] = bit(i);

  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = bit(i);
}

// Standard four-rule penalty: runs, 2×2 blocks, finder-lookalikes,
// dark/light balance.
function penalty(m) {
  const { size, modules } = m;
  let score = 0;

  const runScore = (line) => {
    let s = 0;
    let run = 1;
    for (let i = 1; i <= line.length; i++) {
      if (i < line.length && line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) s += run - 2;
        run = 1;
      }
    }
    return s;
  };
  const col = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    score += runScore(modules[i]);
    for (let j = 0; j < size; j++) col[j] = modules[j][i];
    score += runScore(col);
  }

  for (let y = 0; y < size - 1; y++)
    for (let x = 0; x < size - 1; x++) {
      const v = modules[y][x];
      if (v === modules[y][x + 1] && v === modules[y + 1][x] && v === modules[y + 1][x + 1]) score += 3;
    }

  // 1011101 with 4 light modules on either side, in rows and columns.
  const PATTERNS = [[1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]];
  const matchAt = (get, i) => PATTERNS.some((p) => p.every((v, k) => get(i + k) === v));
  for (let y = 0; y < size; y++)
    for (let x = 0; x <= size - 11; x++) {
      if (matchAt((i) => modules[y][i], x)) score += 40;
      if (matchAt((i) => modules[i][y], x)) score += 40;
    }

  let dark = 0;
  for (const row of modules) for (const v of row) dark += v;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

// ---- public API ---------------------------------------------------------

export function makeQR(text) {
  const bytes = new TextEncoder().encode(text);
  const versionIndex = VERSIONS.findIndex(([capacity]) => bytes.length <= capacity);
  if (versionIndex === -1) throw new Error('Text too long for a version-10 QR code.');

  const codewords = buildCodewords(bytes, versionIndex);
  const m = makeMatrix(versionIndex + 1);
  placeData(m, codewords);

  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(m, mask);
    drawFormatBits(m, mask);
    const score = penalty(m);
    if (score < bestScore) { bestScore = score; best = mask; }
    applyMask(m, mask); // XOR is its own inverse
  }
  applyMask(m, best);
  drawFormatBits(m, best);

  return { size: m.size, modules: m.modules, version: versionIndex + 1, mask: best };
}

// Crisp at any scale, and trivially themeable via currentColor.
export function qrToSvg(qr, { quiet = 3 } = {}) {
  const dim = qr.size + quiet * 2;
  let d = '';
  for (let y = 0; y < qr.size; y++)
    for (let x = 0; x < qr.size; x++)
      if (qr.modules[y][x]) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="UPI QR code"><path fill="currentColor" d="${d}"/></svg>`;
}
