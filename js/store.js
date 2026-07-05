/*!
 * Offline UPI
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// Single localStorage-backed store. Everything the app remembers lives in
// one namespaced blob. No servers, no accounts, clearing site data wipes it.

const KEY = 'offline-upi:v1';
const HISTORY_CAP = 200;

const defaults = () => ({
  settings: { theme: 'light', haptics: true, onboarded: false },
  profile: { name: '', vpa: '' },
  payees: [],
  history: [],
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

let state = load();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked; the app still works for this session.
  }
  listeners.forEach((fn) => fn(state));
}

export const store = {
  get: () => state,

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  patchSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    persist();
  },

  setProfile(profile) {
    state.profile = { ...state.profile, ...profile };
    persist();
  },

  // ---- payees ----------------------------------------------------------

  addPayee({ name, vpa }) {
    const existing = state.payees.find((p) => p.vpa.toLowerCase() === vpa.toLowerCase());
    if (existing) {
      existing.name = name || existing.name;
      persist();
      return existing;
    }
    const payee = { id: uid(), name: name || vpa.split('@')[0], vpa, timesPaid: 0, lastPaidAt: null, createdAt: Date.now() };
    state.payees.push(payee);
    persist();
    return payee;
  },

  updatePayee(id, patch) {
    const p = state.payees.find((p) => p.id === id);
    if (p) Object.assign(p, patch);
    persist();
  },

  removePayee(id) {
    state.payees = state.payees.filter((p) => p.id !== id);
    persist();
  },

  findPayeeByVpa(vpa) {
    return state.payees.find((p) => p.vpa.toLowerCase() === String(vpa).toLowerCase()) ?? null;
  },

  // Most useful first: recently paid, then most paid, then newest.
  rankedPayees() {
    return [...state.payees].sort((a, b) =>
      (b.lastPaidAt ?? 0) - (a.lastPaidAt ?? 0) ||
      b.timesPaid - a.timesPaid ||
      b.createdAt - a.createdAt);
  },

  // ---- history ---------------------------------------------------------

  // A payment is recorded the moment we hand off to the dialer, as
  // 'unconfirmed'. The user settles it to sent/failed afterwards, since the
  // web app has no way to observe the USSD session itself.
  recordPayment({ vpa, name, amount, note }) {
    const txn = { id: uid(), vpa, name, amount, note: note || null, status: 'unconfirmed', ref: null, at: Date.now() };
    state.history.unshift(txn);
    if (state.history.length > HISTORY_CAP) state.history.length = HISTORY_CAP;
    const payee = this.findPayeeByVpa(vpa);
    if (payee) {
      payee.timesPaid += 1;
      payee.lastPaidAt = txn.at;
    }
    persist();
    return txn;
  },

  settlePayment(id, status, ref) {
    const txn = state.history.find((t) => t.id === id);
    if (!txn) return;
    txn.status = status;
    if (ref) txn.ref = ref;
    persist();
  },

  removePayment(id) {
    state.history = state.history.filter((t) => t.id !== id);
    persist();
  },

  latestUnconfirmed() {
    return state.history.find((t) => t.status === 'unconfirmed') ?? null;
  },

  clearHistory() {
    state.history = [];
    persist();
  },

  eraseEverything() {
    state = defaults();
    persist();
  },
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
