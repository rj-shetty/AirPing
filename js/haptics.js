/*!
 * AirPing
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// Thin wrapper over navigator.vibrate. No-ops silently where unsupported
// (iOS Safari) or when the user turns haptics off.

import { store } from './store.js';

function buzz(pattern) {
  if (!store.get().settings.haptics) return;
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

export const haptics = {
  tap: () => buzz(8),
  key: () => buzz(4),
  confirm: () => buzz([12, 40, 20]),
  warn: () => buzz([30, 60, 30]),
};
