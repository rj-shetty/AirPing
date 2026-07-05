/*!
 * Offline UPI
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// QR scanner. Uses the platform BarcodeDetector (on-device, offline) over a
// camera preview, with a gallery-import path for screenshots of QR codes.
// Where the API is missing (mostly desktop browsers) it degrades to a clear
// explanation instead of a broken viewfinder.

import { parseUpiUri, isValidVpa } from '../upi.js';
import { qs, esc, icon, toast } from '../ui.js';
import { haptics } from '../haptics.js';

export function initScan(root, { nav }) {
  let stream = null;
  let rafId = 0;
  let detector = null;
  let torchOn = false;
  let lastMissToast = 0;

  const supported = 'BarcodeDetector' in window;

  function render() {
    root.innerHTML = `
      <div class="scanner">
        <video playsinline muted autoplay></video>
        <div class="scan-veil"></div>
        <div class="scan-frame">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <path d="M8 30V16a8 8 0 0 1 8-8h14M70 8h14a8 8 0 0 1 8 8v14M92 70v14a8 8 0 0 1-8 8H70M30 92H16a8 8 0 0 1-8-8V70"/>
          </svg>
        </div>
        <div class="scan-top">
          <span class="scan-title">Point at any UPI QR</span>
          <button type="button" class="iconbtn" data-cancel aria-label="Close scanner">${icon('x')}</button>
        </div>
        <p class="scan-hint" data-hint>Shop stickers, PhonePe / GPay / Paytm codes. They all carry the same UPI ID inside.</p>
        <div class="scan-controls">
          <button type="button" class="iconbtn" data-torch hidden aria-label="Toggle torch">${icon('bolt')}</button>
          <button type="button" class="iconbtn" data-gallery aria-label="Scan an image from your gallery">${icon('image')}</button>
          <input type="file" accept="image/*" hidden data-file />
        </div>
      </div>`;

    qs('[data-cancel]', root).addEventListener('click', () => nav.go('home'));
    qs('[data-gallery]', root).addEventListener('click', () => qs('[data-file]', root).click());
    qs('[data-file]', root).addEventListener('change', onGalleryPick);
    qs('[data-torch]', root).addEventListener('click', toggleTorch);
  }

  function renderFallback(message) {
    root.innerHTML = `
      <div class="scanner">
        <div class="scan-fallback">
          <h2 class="scan-title" style="margin-bottom:10px">Can't scan here</h2>
          <p class="small" style="opacity:.8">${esc(message)}</p>
          <div class="stack" style="margin-top:22px;max-width:300px;margin-inline:auto">
            ${supported ? `
              <button type="button" class="btn btn--gold btn--block" data-gallery>${icon('image')} Pick a QR image instead</button>
              <input type="file" accept="image/*" hidden data-file />` : ''}
            <button type="button" class="btn btn--ghost btn--block" style="color:inherit;border-color:rgba(240,233,214,.35)" data-manual>Type the UPI ID instead</button>
          </div>
        </div>
      </div>`;
    qs('[data-manual]', root).addEventListener('click', () => nav.go('pay'));
    qs('[data-gallery]', root)?.addEventListener('click', () => qs('[data-file]', root).click());
    qs('[data-file]', root)?.addEventListener('change', onGalleryPick);
  }

  async function start() {
    if (!supported) {
      renderFallback('This browser has no on-device barcode engine. On an Android phone (Chrome), scanning works fully offline.');
      return;
    }
    render();
    detector ??= new BarcodeDetector({ formats: ['qr_code'] });

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } },
      });
    } catch {
      renderFallback('Camera permission was declined (or no camera exists). You can still scan a saved image or type the ID.');
      return;
    }

    const video = qs('video', root);
    video.srcObject = stream;
    try { await video.play(); } catch { /* autoplay policies; the stream still renders */ }

    const track = stream.getVideoTracks()[0];
    if (track?.getCapabilities?.().torch) {
      qs('[data-torch]', root).hidden = false;
    }

    const tick = async () => {
      if (!stream) return;
      if (video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          if (codes.length && handleDecoded(codes[0].rawValue)) return;
        } catch { /* a bad frame now and then is normal */ }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    torchOn = false;
  }

  async function toggleTorch() {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    torchOn = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: torchOn }] });
      qs('[data-torch]', root).classList.toggle('is-on', torchOn);
    } catch {
      torchOn = false;
    }
  }

  async function onGalleryPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      detector ??= new BarcodeDetector({ formats: ['qr_code'] });
      const bitmap = await createImageBitmap(file);
      const codes = await detector.detect(bitmap);
      bitmap.close?.();
      if (!codes.length || !handleDecoded(codes[0].rawValue)) {
        toast('No UPI QR found in that image', { icon: 'x' });
      }
    } catch {
      toast('Could not read that image', { icon: 'x' });
    }
  }

  // Returns true when we navigated away with a usable result.
  function handleDecoded(raw) {
    const parsed = parseUpiUri(raw);
    if (parsed) {
      haptics.confirm();
      stop();
      nav.go('pay', parsed);
      return true;
    }
    // Some stickers are just the bare VPA in plain text.
    if (isValidVpa(raw)) {
      haptics.confirm();
      stop();
      nav.go('pay', { vpa: raw.trim() });
      return true;
    }
    // A QR, but not a UPI one. Tell them once, keep scanning.
    if (Date.now() - lastMissToast > 2500) {
      lastMissToast = Date.now();
      toast('That QR isn’t a UPI code', { icon: 'x' });
    }
    return false;
  }

  return {
    onShow: start,
    onHide: stop,
  };
}
