/*!
 * Offline UPI
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// Saved payees. USSD makes typing UPI IDs painful, so saving people is the
// single biggest quality-of-life feature in the whole app.

import { store } from '../store.js';
import { isValidVpa, vpaProvider } from '../upi.js';
import { qs, esc, icon, sheet, toast, avatarHtml, confirmSheet } from '../ui.js';
import { haptics } from '../haptics.js';

export function initPeople(root, { nav }) {
  let query = '';

  function render() {
    const all = store.rankedPayees();
    const q = query.toLowerCase();
    const people = all.filter((p) =>
      !q || p.name.toLowerCase().includes(q) || p.vpa.toLowerCase().includes(q));

    root.innerHTML = `
      <div class="flow-head" style="margin-bottom:14px">
        <h1 class="screen-title" style="flex:1">People</h1>
        <button type="button" class="iconbtn" data-add aria-label="Add a person">${icon('plus')}</button>
      </div>
      ${all.length ? `
        <input class="input" data-search type="search" placeholder="Search people" value="${esc(query)}" style="margin-bottom:6px" />
        <div class="rows">
          ${people.map((p) => `
            <div class="row" data-person="${esc(p.id)}">
              ${avatarHtml(p.name)}
              <button type="button" class="row-main" data-pay style="all:unset;flex:1;min-width:0;cursor:pointer">
                <b>${esc(p.name)}</b>
                <span class="small muted mono" style="display:block;overflow:hidden;text-overflow:ellipsis">${esc(p.vpa)}</span>
              </button>
              <span class="row-side" style="display:flex;gap:8px">
                <button type="button" class="iconbtn" data-edit aria-label="Edit ${esc(p.name)}">${icon('pencil')}</button>
              </span>
            </div>`).join('') ||
            `<p class="small muted" style="padding:14px 2px">Nobody matches “${esc(query)}”.</p>`}
        </div>` : `
        <div class="empty">
          <div class="empty-mark"><svg viewBox="0 0 48 48"><use href="#i-mark"/></svg></div>
          <h3>No one saved yet</h3>
          <p>Save the UPI IDs you pay often. Typing them into a USSD box twice is once too many.</p>
          <button type="button" class="btn btn--primary" data-add-first>${icon('plus')} Add someone</button>
        </div>`}
    `;

    qs('[data-search]', root)?.addEventListener('input', (e) => {
      query = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const search = qs('[data-search]', root);
      search.focus({ preventScroll: true });
      search.setSelectionRange(pos, pos);
    });
    qs('[data-add]', root).addEventListener('click', () => openEditor());
    qs('[data-add-first]', root)?.addEventListener('click', () => openEditor());

    root.querySelectorAll('[data-person]').forEach((row) => {
      const person = () => store.get().payees.find((p) => p.id === row.dataset.person);
      qs('[data-pay]', row).addEventListener('click', () => {
        const p = person();
        if (!p) return;
        haptics.tap();
        nav.go('pay', { vpa: p.vpa, name: p.name });
      });
      qs('[data-edit]', row).addEventListener('click', () => {
        const p = person();
        if (p) openEditor(p);
      });
    });
  }

  function openEditor(person = null) {
    const s = sheet(`
      <h2>${person ? 'Edit person' : 'Add a person'}</h2>
      <div class="stack" style="margin-top:18px">
        <label class="field">
          <span class="field-label">Name</span>
          <input class="input" data-name type="text" maxlength="40" placeholder="Ramesh from the tea stall" value="${esc(person?.name ?? '')}" />
        </label>
        <label class="field">
          <span class="field-label">UPI ID</span>
          <input class="input input--mono" data-vpa type="text" inputmode="email" autocapitalize="none" maxlength="60"
                 spellcheck="false" placeholder="name@bank" value="${esc(person?.vpa ?? '')}" />
          <span class="field-hint" data-hint></span>
        </label>
        <button type="button" class="btn btn--primary btn--block" data-save disabled>${person ? 'Save changes' : 'Save person'}</button>
        ${person ? `<button type="button" class="linklike small" data-remove style="margin:2px auto 0;color:var(--red)">Remove ${esc(person.name)}</button>` : ''}
      </div>
    `);

    const nameInput = qs('[data-name]', s.el);
    const vpaInput = qs('[data-vpa]', s.el);
    const hint = qs('[data-hint]', s.el);
    const save = qs('[data-save]', s.el);

    const check = () => {
      const vpa = vpaInput.value.trim();
      const valid = isValidVpa(vpa);
      save.disabled = !valid || !nameInput.value.trim();
      hint.className = 'field-hint' + (vpa ? (valid ? ' is-good' : '') : '');
      hint.textContent = !vpa ? '' : valid
        ? (vpaProvider(vpa) ? `Looks like a ${vpaProvider(vpa)} ID` : 'Looks good')
        : 'Something like name@bank';
      vpaInput.classList.toggle('is-invalid', !!vpa && !valid);
    };
    nameInput.addEventListener('input', check);
    vpaInput.addEventListener('input', check);
    check();

    save.addEventListener('click', () => {
      haptics.confirm();
      const name = nameInput.value.trim();
      const vpa = vpaInput.value.trim();
      if (person) {
        store.updatePayee(person.id, { name, vpa });
        toast('Saved');
      } else {
        store.addPayee({ name, vpa });
        toast(`${name} added`);
      }
      s.close();
    });

    qs('[data-remove]', s.el)?.addEventListener('click', async () => {
      s.close();
      const yes = await confirmSheet({
        title: `Remove ${person.name}?`,
        body: 'Past ledger entries stay; only the saved contact goes.',
        confirmLabel: 'Remove',
        danger: true,
      });
      if (yes) {
        store.removePayee(person.id);
        toast('Removed');
      }
    });
  }

  store.subscribe(() => {
    if (root.classList.contains('is-active')) render();
  });

  return { onShow: () => { query = ''; render(); } };
}
