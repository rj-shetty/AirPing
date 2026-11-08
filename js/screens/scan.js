/*!
 * AirPing
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// QR scanner. Prefers the platform BarcodeDetector (on-device, offline) where
// it exists (Chromium/Android). Where it does not (Safari/iOS, Firefox), it
// falls back to jsQR, a bundled JS decoder, run over frames drawn to a canvas.
// Either way the camera image never leaves the device. Camera and gallery both
// route through the same decode path.

import { parseUpiUri, isValidVpa } from '../upi.js';
import { qs, esc, icon, toast } from '../ui.js';
import { haptics } from '../haptics.js';

export function initScan(root, { nav }) {
  const native = 'BarcodeDetector' in window;
  const hasCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  let stream = null;
  let detector = null;   // native BarcodeDetector
  let jsqr = null;       // jsQR fallback, loaded on demand
  let timer = 0;
  let stopped = false;
  let torchOn = false;
  let lastMissToast = 0;

  // Offscreen canvas used only for the jsQR path.
  const work = document.createElement('canvas');
  const wctx = work.getContext('2d', { willReadFrequently: true });

  // Load the bundled decoder once, on first need (keeps it off the Android path).
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/jsqr.js';
      s.onload = () => resolve(window.jsQR);
      s.onerror = () => reject(new Error('decoder failed to load'));
      document.head.appendChild(s);
    });
  }

  function imageData(source, sw, sh) {
    const max = 500; // downscale for a fast, still-decodable frame
    const scale = Math.min(1, max / Math.max(sw, sh)) || 1;
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    work.width = w;
    work.height = h;
    wctx.drawImage(source, 0, 0, w, h);
    return wctx.getImageData(0, 0, w, h);
  }

  async function decodeVideoFrame(video) {
    if (native) {
      detector ??= new BarcodeDetector({ formats: ['qr_code'] });
      const codes = await detector.detect(video);
      return codes[0]?.rawValue ?? null;
    }
    if (!jsqr) return null;
    const img = imageData(video, video.videoWidth, video.videoHeight);
    return jsqr(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  }

  async function loadBitmap(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file); } catch { /* fall through */ }
    }
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }

  async function decodeImageFile(file) {
    if (native) {
      detector ??= new BarcodeDetector({ formats: ['qr_code'] });
      const bitmap = await createImageBitmap(file);
      const codes = await detector.detect(bitmap);
      bitmap.close?.();
      return codes[0]?.rawValue ?? null;
    }
    jsqr ??= await loadJsQR();
    const bmp = await loadBitmap(file);
    const w = bmp.width || bmp.naturalWidth;
    const h = bmp.height || bmp.naturalHeight;
    const img = imageData(bmp, w, h);
    bmp.close?.();
    return jsqr(img.data, img.width, img.height)?.data ?? null;
  }

  // ---- views ---------------------------------------------------------------

  function cameraView() {
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

  // Shown when there is no camera or access was blocked. Gallery + typing still
  // work here, since gallery decode does not need the camera.
  function fallbackView(message) {
    root.innerHTML = `
      <div class="scanner">
        <div class="scan-fallback">
          <button type="button" class="iconbtn" data-cancel aria-label="Close" style="position:absolute;top:16px;right:16px">${icon('x')}</button>
          <h2 class="scan-title" style="margin-bottom:10px">Scan a UPI QR</h2>
          <p class="small" style="opacity:.8">${esc(message)}</p>
          <div class="stack" style="margin-top:22px;max-width:300px;margin-inline:auto">
            <button type="button" class="btn btn--gold btn--block" data-gallery>${icon('image')} Pick a QR image</button>
            <input type="file" accept="image/*" hidden data-file />
            <button type="button" class="btn btn--ghost btn--block" style="color:inherit;border-color:rgba(240,233,214,.35)" data-manual>Type the UPI ID instead</button>
          </div>
        </div>
      </div>`;
    qs('[data-cancel]', root).addEventListener('click', () => nav.go('home'));
    qs('[data-manual]', root).addEventListener('click', () => nav.go('pay'));
    qs('[data-gallery]', root).addEventListener('click', () => qs('[data-file]', root).click());
    qs('[data-file]', root).addEventListener('change', onGalleryPick);
  }

  // ---- lifecycle -----------------------------------------------------------

  async function start() {
    stopped = false;
    if (!hasCamera) {
      fallbackView('This device has no camera available. Pick a saved QR image, or type the UPI ID.');
      return;
    }
    cameraView();

    // Warm up the fallback decoder before the loop starts (no-op on Android).
    if (!native) {
      try { jsqr = await loadJsQR(); } catch {
        fallbackView('The QR decoder could not load. Pick a saved QR image, or type the UPI ID.');
        return;
      }
      if (stopped) return; // user left while it loaded
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } },
      });
    } catch {
      fallbackView('Camera access was blocked, or no camera is available. Pick a saved QR image, or type the UPI ID.');
      return;
    }
    if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }

    const video = qs('video', root);
    if (!video) { stream.getTracks().forEach((t) => t.stop()); return; }
    video.srcObject = stream;
    try { await video.play(); } catch { /* autoplay policy; stream still renders */ }

    const track = stream.getVideoTracks()[0];
    if (track?.getCapabilities?.().torch) qs('[data-torch]', root).hidden = false;

    loop(video);
  }

  function loop(video) {
    const tick = async () => {
      if (stopped || !stream) return;
      if (video.readyState >= 2 && video.videoWidth) {
        try {
          const value = await decodeVideoFrame(video);
          if (value && handleDecoded(value)) return;
        } catch { /* a bad frame now and then is normal */ }
      }
      // Native detection is cheap enough for rAF; jsQR is heavier, so throttle.
      timer = native ? requestAnimationFrame(tick) : setTimeout(tick, 110);
    };
    timer = native ? requestAnimationFrame(tick) : setTimeout(tick, 110);
  }

  function stop() {
    stopped = true;
    if (native) cancelAnimationFrame(timer);
    else clearTimeout(timer);
    timer = 0;
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
      const value = await decodeImageFile(file);
      if (!value || !handleDecoded(value)) {
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
