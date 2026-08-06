# Vendors & Budget Admin Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new back-office tabs — "Prestataires" (vendor CRUD) and "Budget" (read-only aggregation of vendor totals/payments against a configurable target) — following the existing section pattern in `admin/`.

**Architecture:** Two new Firestore-backed sections registered in `admin/sections-registry.js`. `admin/vendors.js` owns full CRUD on the `vendors` collection (table + slide-in panel, same shape as `admin/events.js`). `admin/budget.js` has no collection of its own for expenses — it imports `loadVendors()` from `vendors.js` and aggregates client-side, plus reads/writes a single `settings/budget` document for the target amount. Both wire into the existing nav (`admin/index.html`, `admin/script.js`) the same way `events`/`guests`/`users` already do.

**Tech Stack:** Vanilla JS ES modules, Firebase Firestore v10 (CDN imports), no build step, no test framework (this codebase has none — verification is manual in-browser against the real Firestore project).

## Global Constraints

- No test framework exists in this repo — every task's "test" step is a manual browser verification against the running admin app (docker-compose `web` service on `localhost:8090`, or any already-running dev server), not an automated test file.
- Firestore access is real (no emulator configured) — verification steps that write data must clean up after themselves (delete the test doc/values they created), same discipline as manually testing `events.js` today.
- All new user-facing strings are French, matching every existing tab.
- `escapeHtml()` is duplicated per-file in this codebase (see `events.js`, `guests.js`, `users.js`) — follow that convention, don't introduce a shared module.
- Money values are plain numbers (no currency formatting library in the codebase) — render with `.toFixed(2)` + literal `€` suffix, matching no prior art exactly but staying consistent with the plain-number style used for `rsvp.adults` etc.
- Cache-bust query strings (`?v=N`) are used on every admin JS import in `index.html`/`script.js`/cross-imports (see `admin/script.js:2-7`) — every new/modified file needs its import bumped when changed, per the existing convention (see recent commit `4a0154b`).

---

### Task 1: Firestore rules for `vendors` and `settings`

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Produces: `perm('vendors')` and `perm('budget')` gating, consumed by no code (enforced server-side only) but required before Task 3/5 writes will succeed against real Firestore.

- [ ] **Step 1: Add rules for the `vendors` collection**

Edit `firestore.rules`, add after the `blocks` match block (currently lines 25-28):

```
    match /vendors/{vendorId} {
      allow read: if perm('vendors') in ['read', 'write'];
      allow write: if perm('vendors') == 'write';
    }

    match /settings/{docId} {
      allow read: if perm('budget') in ['read', 'write'];
      allow write: if perm('budget') == 'write';
    }
```

Full block after edit (lines 12-32 region):

```
    match /events/{eventId} {
      allow read: if true;
      allow write: if perm('events') == 'write';
    }

    match /guests/{guestId} {
      allow get: if true;
      allow list: if perm('guests') in ['read', 'write'];
      allow create, delete: if perm('guests') == 'write';
      allow update: if perm('guests') == 'write'
        || request.resource.data.diff(resource.data).affectedKeys().hasOnly(['rsvp']);
    }

    match /blocks/{blockId} {
      allow read: if true;
      allow write: if perm('blocks') == 'write';
    }

    match /vendors/{vendorId} {
      allow read: if perm('vendors') in ['read', 'write'];
      allow write: if perm('vendors') == 'write';
    }

    match /settings/{docId} {
      allow read: if perm('budget') in ['read', 'write'];
      allow write: if perm('budget') == 'write';
    }

    match /admins/{uid} {
      ...
```

- [ ] **Step 2: Verify the file is syntactically consistent**

Run: `grep -c "match /" firestore.rules`
Expected: `6` (events, guests, blocks, vendors, settings, admins)

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: add firestore rules for vendors and settings collections"
```

Note: these rules must be deployed (`firebase deploy --only firestore:rules`) before Task 3/5 verification steps will work against the live project. That deploy is a manual, separate action outside this plan (affects shared production Firestore) — flag it to the user before running it.

---

### Task 2: CSS for vendor status badges, payment list, and budget progress bar

**Files:**
- Modify: `admin/styles.css`

**Interfaces:**
- Produces: CSS classes `.badge-contacted`, `.badge-booked`, `.badge-paid`, `.payment-list`, `.payment-row`, `.payment-row-remove`, `.progress-bar`, `.progress-bar-fill`, `.budget-summary`, `.budget-summary-row` — consumed by `admin/vendors.js` (Task 3) and `admin/budget.js` (Task 5).

- [ ] **Step 1: Add vendor status badges next to the existing badge definitions**

In `admin/styles.css`, after line 120 (`.badge-deux{...}`), add:

```css
.badge-contacted{background:#fef3c7;color:#92400e}
.badge-booked{background:#dbeafe;color:#1d4ed8}
.badge-paid{background:#dcfce7;color:#15803d}
```

- [ ] **Step 2: Add payment list styles**

After the `.event-card` block (after line 154), add:

```css
/* ── Payment list (vendor form) ── */
.payment-list{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
.payment-row{display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px}
.payment-row span{white-space:nowrap}
.payment-row .payment-row-note{flex:1;color:var(--muted);overflow:hidden;text-overflow:ellipsis}
.payment-row-remove{margin-left:auto}
.payment-add-row{display:flex;gap:6px;margin-bottom:14px}
.payment-add-row input{flex:1;min-width:0}
```

- [ ] **Step 3: Add budget progress bar and summary styles**

After the `.stats-side-grid`/`.stats-side-card`/`.stats-side-row` block (after line 102), add:

```css
/* ── Budget summary ── */
.budget-summary{background:var(--admin-card);border-radius:8px;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.04);margin-bottom:20px}
.budget-summary-row{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}
.budget-summary-row:last-of-type{margin-bottom:14px}
.budget-target-input{display:flex;align-items:center;gap:8px}
.budget-target-input input{width:120px}
.progress-bar{height:10px;background:var(--admin-bg);border-radius:999px;overflow:hidden;border:1px solid var(--border)}
.progress-bar-fill{height:100%;background:var(--accent);border-radius:999px;transition:width .2s}
.progress-bar-fill.over{background:var(--danger)}
```

- [ ] **Step 4: Commit**

```bash
git add admin/styles.css
git commit -m "feat: add CSS for vendor badges, payment list, budget progress bar"
```

---

### Task 3: `admin/vendors.js` — vendor CRUD with embedded payments

**Files:**
- Create: `admin/vendors.js`

**Interfaces:**
- Consumes: `db` from `../firebase-init.js`; `canWrite` from `./permissions.js` (signature: `canWrite(sectionId: string): boolean`).
- Produces: `export async function loadVendors(): Promise<Array<{id, category, name, contact, status, total, payments, dueDate, link, notes}>>` (consumed by `admin/budget.js` in Task 5); `export async function renderVendorsTab(): Promise<void>` (consumed by `admin/script.js` nav wiring in Task 4).

- [ ] **Step 1: Create the file with imports, constants, and `loadVendors`**

Create `admin/vendors.js`:

```js
// admin/vendors.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';

const vendorsCol = collection(db, 'vendors');

const STATUS_LABELS = { contacted: 'Contacté', booked: 'Réservé', paid: 'Payé' };
const STATUS_BADGE = { contacted: 'badge-contacted', booked: 'badge-booked', paid: 'badge-paid' };
const CATEGORIES = ['Traiteur', 'Photographe', 'DJ', 'Lieu', 'Fleuriste', 'Autre'];

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function fmtMoney(n) {
  return `${(Number(n) || 0).toFixed(2)} €`;
}

export function paidAmount(vendor) {
  return (vendor.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

export async function loadVendors() {
  const snap = await getDocs(vendorsCol);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || ''));
}
```

- [ ] **Step 2: Add `renderVendorRow` and `renderVendorsTab`**

Append to `admin/vendors.js`:

```js
function renderVendorRow(v, editable) {
  const status = v.status || 'contacted';
  const paid = paidAmount(v);
  const remaining = (Number(v.total) || 0) - paid;
  const actionsCell = editable
    ? `<div class="table-actions">
         <button class="btn-secondary btn-edit-vendor" data-id="${escapeHtml(v.id)}">Modifier</button>
         <button class="btn-danger btn-delete-vendor" data-id="${escapeHtml(v.id)}">Supprimer</button>
       </div>`
    : '';
  return `
    <tr>
      <td>${escapeHtml(v.category || '')}</td>
      <td>${escapeHtml(v.name || '')}</td>
      <td><span class="badge ${STATUS_BADGE[status]}">${STATUS_LABELS[status]}</span></td>
      <td>${fmtMoney(v.total)}</td>
      <td>${fmtMoney(paid)}</td>
      <td>${fmtMoney(remaining)}</td>
      <td>${v.dueDate ? escapeHtml(v.dueDate) : ''}</td>
      <td>${actionsCell}</td>
    </tr>`;
}

export async function renderVendorsTab() {
  const panel = document.getElementById('tab-vendors');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('vendors');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-vendor-btn" class="btn-primary">+ Ajouter un prestataire</button>'
    : '';

  let vendors;
  try {
    vendors = await loadVendors();
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }

  panel.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Catégorie</th><th>Nom</th><th>Statut</th><th>Total</th>
          <th>Versé</th><th>Reste</th><th>Échéance</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${vendors.length
          ? vendors.map(v => renderVendorRow(v, editable)).join('')
          : '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:40px">Aucun prestataire.</td></tr>'}
      </tbody>
    </table>`;

  if (editable) {
    document.getElementById('add-vendor-btn').addEventListener('click', () => openVendorPanel(null, vendors));
    panel.querySelectorAll('.btn-edit-vendor').forEach(btn =>
      btn.addEventListener('click', () => openVendorPanel(btn.dataset.id, vendors))
    );
    panel.querySelectorAll('.btn-delete-vendor').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer ce prestataire ?')) return;
        await deleteDoc(doc(db, 'vendors', btn.dataset.id));
        renderVendorsTab();
      })
    );
  }
}
```

- [ ] **Step 3: Add `openVendorPanel` with the payments sub-editor**

Append to `admin/vendors.js`:

```js
function renderPaymentRow(p, idx) {
  return `
    <div class="payment-row" data-idx="${idx}">
      <span>${escapeHtml(p.date || '')}</span>
      <span>${fmtMoney(p.amount)}</span>
      <span class="payment-row-note">${escapeHtml(p.note || '')}</span>
      <button type="button" class="btn-icon payment-row-remove" data-idx="${idx}">✕</button>
    </div>`;
}

function openVendorPanel(id, vendors) {
  const vendor = id ? vendors.find(v => v.id === id) : null;
  const isNew = !vendor;
  const payments = (vendor?.payments || []).map(p => ({ ...p }));

  const v = (key) => escapeHtml(vendor?.[key] ?? '');

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${isNew ? 'Nouveau prestataire' : 'Modifier le prestataire'}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      <label class="field">
        <span>Catégorie</span>
        <select id="v-category">
          ${CATEGORIES.map(c => `<option value="${c}" ${vendor?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>Nom</span><input id="v-name" value="${v('name')}" required></label>
      <label class="field"><span>Contact</span><input id="v-contact" value="${v('contact')}"></label>
      <label class="field">
        <span>Statut</span>
        <select id="v-status">
          ${Object.keys(STATUS_LABELS).map(s => `<option value="${s}" ${(vendor?.status || 'contacted') === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>Total prévu (€)</span><input id="v-total" type="number" min="0" step="0.01" value="${vendor?.total ?? ''}"></label>
      <label class="field"><span>Échéance</span><input id="v-due" type="date" value="${v('dueDate')}"></label>
      <label class="field"><span>Lien (devis/contrat)</span><input id="v-link" type="url" value="${v('link')}"></label>
      <label class="field"><span>Notes</span><textarea id="v-notes">${v('notes')}</textarea></label>
      <div class="field">
        <span>Versements</span>
        <div class="payment-list" id="payment-list">
          ${payments.map((p, i) => renderPaymentRow(p, i)).join('') || '<p style="color:var(--muted);font-size:12.5px">Aucun versement.</p>'}
        </div>
        <div class="payment-add-row">
          <input id="pay-date" type="date">
          <input id="pay-amount" type="number" min="0" step="0.01" placeholder="Montant">
          <input id="pay-note" type="text" placeholder="Note (optionnel)">
          <button type="button" class="btn-secondary" id="pay-add">Ajouter</button>
        </div>
      </div>
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">${isNew ? 'Créer' : 'Enregistrer'}</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); renderVendorsTab(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  function refreshPaymentList() {
    const listEl = panelEl.querySelector('#payment-list');
    listEl.innerHTML = payments.map((p, i) => renderPaymentRow(p, i)).join('')
      || '<p style="color:var(--muted);font-size:12.5px">Aucun versement.</p>';
    listEl.querySelectorAll('.payment-row-remove').forEach(btn =>
      btn.addEventListener('click', () => {
        payments.splice(Number(btn.dataset.idx), 1);
        refreshPaymentList();
      })
    );
  }
  refreshPaymentList();

  panelEl.querySelector('#pay-add').addEventListener('click', () => {
    const date = panelEl.querySelector('#pay-date').value;
    const amount = Number(panelEl.querySelector('#pay-amount').value);
    const note = panelEl.querySelector('#pay-note').value.trim();
    if (!amount || amount <= 0) return;
    payments.push({ date, amount, note });
    panelEl.querySelector('#pay-date').value = '';
    panelEl.querySelector('#pay-amount').value = '';
    panelEl.querySelector('#pay-note').value = '';
    refreshPaymentList();
  });

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const name = panelEl.querySelector('#v-name').value.trim();
    if (!name) return;

    const data = {
      category: panelEl.querySelector('#v-category').value,
      name,
      contact: panelEl.querySelector('#v-contact').value.trim(),
      status: panelEl.querySelector('#v-status').value,
      total: Number(panelEl.querySelector('#v-total').value) || 0,
      dueDate: panelEl.querySelector('#v-due').value,
      link: panelEl.querySelector('#v-link').value.trim(),
      notes: panelEl.querySelector('#v-notes').value.trim(),
      payments,
    };

    if (id) {
      await updateDoc(doc(db, 'vendors', id), data);
    } else {
      await addDoc(vendorsCol, data);
    }
    close();
  });
}
```

- [ ] **Step 4: Manual verification — vendor CRUD with payments**

Prerequisite: Task 1's rules deployed, and the current admin user has `write` permission on `vendors` (temporarily grant it via the `admins/{uid}` doc in the Firebase console if `users.js`/Task 4/6 permission UI isn't wired yet — `sections-registry.js` isn't updated until Task 4, so there's no UI toggle for it yet at this point in the plan; this is expected, verify via Firestore console).

Since `renderVendorsTab` isn't reachable from the nav yet (Task 4 wires that), verify by temporarily calling it from the browser console:

1. Start the app: `docker compose up -d` (serves on `http://localhost:8090`), log into `/admin/`.
2. Open browser devtools console, run:
   ```js
   import('/admin/vendors.js').then(m => { window.__v = m; document.getElementById('tab-dashboard').hidden = true; document.getElementById('tab-blocks').id = 'tab-vendors'; return m.renderVendorsTab(); })
   ```
   (This repurposes the `blocks` panel element as `tab-vendors` for this one-off manual check — a throwaway DOM hack, not a code change.)
3. Confirm the empty-state table renders ("Aucun prestataire").
4. Click "+ Ajouter un prestataire", fill Nom="Test Traiteur", Total=1000, add a payment (date today, amount 200, note "Acompte"), click Créer.
5. Confirm the panel closes and the table shows the new row with Total 1000.00 €, Versé 200.00 €, Reste 800.00 €.
6. Open Firestore console, confirm the `vendors` collection has one doc with `payments: [{date, amount: 200, note: "Acompte"}]`.
7. Click Modifier on the row, remove the payment via the ✕, add a second payment of 300, save. Confirm Versé updates to 300.00 €.
8. Click Supprimer, confirm the row disappears and the Firestore doc is gone.
9. Reload the page (undoing the throwaway DOM hack from step 2).

- [ ] **Step 5: Commit**

```bash
git add admin/vendors.js
git commit -m "feat: add vendors.js with CRUD and embedded payment tracking"
```

---

### Task 4: Wire the "Prestataires" tab into the nav

**Files:**
- Modify: `admin/sections-registry.js`
- Modify: `admin/index.html`
- Modify: `admin/script.js`

**Interfaces:**
- Consumes: `renderVendorsTab` from `./vendors.js` (Task 3).

- [ ] **Step 1: Register the section**

In `admin/sections-registry.js`, add after the `blocks` entry (line 2):

```js
  { id: 'vendors', label: 'Prestataires', collection: 'vendors' },
```

Full file becomes:

```js
export const SECTIONS = [
  { id: 'blocks', label: 'Blocs', collection: 'blocks' },
  { id: 'vendors', label: 'Prestataires', collection: 'vendors' },
  { id: 'guests', label: 'Invités', collection: 'guests' },
  { id: 'events', label: 'Événements', collection: 'events' },
  { id: 'users', label: 'Utilisateurs', collection: 'admins' },
];
```

- [ ] **Step 2: Add the nav button and tab panel in `admin/index.html`**

After the `blocks` nav button (line 44, closing `</button>`), add:

```html
      <button class="nav-item" data-section="vendors" hidden>
        <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-9M14 17H5M17 4l3 3-3 3M7 14l-3 3 3 3"/></svg></span> Prestataires
      </button>
```

After the `tab-blocks` div (line 67), add:

```html
      <div id="tab-vendors" class="tab-panel" hidden></div>
```

Also bump the cache-bust version on the script tag (line 75): `/admin/script.js?v=12` → `/admin/script.js?v=13`.

- [ ] **Step 3: Wire the import and maps in `admin/script.js`**

Add the import after line 5 (`import { renderGuestsTab } ...`):

```js
import { renderVendorsTab } from './vendors.js?v=1';
```

Add to `RENDER_BY_ID` (currently lines 12-17):

```js
const RENDER_BY_ID = {
  blocks: renderBlocksTab,
  vendors: renderVendorsTab,
  guests: renderGuestsTab,
  events: renderEventsTab,
  users: renderUsersTab,
};
```

Add to `SLUG_BY_SECTION` (line 26):

```js
const SLUG_BY_SECTION = { dashboard: 'dashboard', blocks: 'content', vendors: 'vendors', guests: 'guest', events: 'events', users: 'users' };
```

- [ ] **Step 4: Manual verification**

1. In Firestore console (or via Task 6's user-management UI once it exists — for now use the console), set the logged-in admin's `permissions.vendors` to `write`.
2. Reload `/admin/`, confirm "Prestataires" appears in the sidebar.
3. Click it, confirm URL becomes `/admin/vendors/`, table renders (reuse or re-add the test vendor from Task 3 step 4 if it was cleaned up).
4. Reload the page directly at `/admin/vendors/` (deep link), confirm it lands on the Prestataires tab (exercises the existing `sectionFromPath()`/nginx rewrite).
5. Set `permissions.vendors` to `none`, reload, confirm the nav item is hidden again.
6. Restore `permissions.vendors` to `write` for the next task's verification.

- [ ] **Step 5: Commit**

```bash
git add admin/sections-registry.js admin/index.html admin/script.js
git commit -m "feat: wire Prestataires tab into admin nav"
```

---

### Task 5: `admin/budget.js` — aggregated budget view

**Files:**
- Create: `admin/budget.js`

**Interfaces:**
- Consumes: `loadVendors(): Promise<Array<vendor>>` and `paidAmount(vendor): number` from `./vendors.js` (Task 3); `canWrite` from `./permissions.js`; `db` from `../firebase-init.js`.
- Produces: `export async function renderBudgetTab(): Promise<void>` (consumed by `admin/script.js` nav wiring in Task 6).

- [ ] **Step 1: Create the file with target load/save helpers**

Create `admin/budget.js`:

```js
// admin/budget.js
import { db } from '../firebase-init.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadVendors, paidAmount } from './vendors.js?v=1';
import { canWrite } from './permissions.js';

const budgetDocRef = doc(db, 'settings', 'budget');

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function fmtMoney(n) {
  return `${(Number(n) || 0).toFixed(2)} €`;
}

async function loadTarget() {
  try {
    const snap = await getDoc(budgetDocRef);
    return snap.exists() ? (Number(snap.data().target) || 0) : 0;
  } catch (err) {
    console.error('loadTarget failed', err);
    return 0;
  }
}

async function saveTarget(target) {
  await setDoc(budgetDocRef, { target }, { merge: true });
}
```

- [ ] **Step 2: Add category aggregation, matching `dashboard.js`'s `computeEventStats`/`renderEventStats` shape**

Append to `admin/budget.js`:

```js
function computeCategoryStats(vendors) {
  const byCategory = {};
  vendors.forEach(v => {
    const cat = v.category || 'Autre';
    if (!byCategory[cat]) byCategory[cat] = { category: cat, engaged: 0, paid: 0 };
    byCategory[cat].engaged += Number(v.total) || 0;
    byCategory[cat].paid += paidAmount(v);
  });
  return Object.values(byCategory).sort((a, b) => a.category.localeCompare(b.category));
}

function renderCategoryTable(categoryStats) {
  if (!categoryStats.length) return '';
  return `
    <table class="admin-table">
      <thead>
        <tr><th>Catégorie</th><th>Engagé</th><th>Versé</th><th>Reste</th></tr>
      </thead>
      <tbody>
        ${categoryStats.map(c => `
          <tr>
            <td>${escapeHtml(c.category)}</td>
            <td>${fmtMoney(c.engaged)}</td>
            <td>${fmtMoney(c.paid)}</td>
            <td>${fmtMoney(c.engaged - c.paid)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}
```

- [ ] **Step 3: Add `renderBudgetTab`**

Append to `admin/budget.js`:

```js
export async function renderBudgetTab() {
  const panel = document.getElementById('tab-budget');
  document.getElementById('section-action').innerHTML = '';
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('budget');

  let vendors, target;
  try {
    [vendors, target] = await Promise.all([loadVendors(), loadTarget()]);
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }

  const totalEngaged = vendors.reduce((sum, v) => sum + (Number(v.total) || 0), 0);
  const totalPaid = vendors.reduce((sum, v) => sum + paidAmount(v), 0);
  const pct = target > 0 ? Math.min(100, Math.round((totalPaid / target) * 100)) : 0;
  const over = target > 0 && totalPaid > target;
  const categoryStats = computeCategoryStats(vendors);

  panel.innerHTML = `
    <div class="budget-summary">
      <div class="budget-summary-row">
        <span>Budget cible</span>
        ${editable
          ? `<div class="budget-target-input">
               <input id="budget-target-input" type="number" min="0" step="0.01" value="${target || ''}">
               <button class="btn-secondary" id="budget-target-save">Enregistrer</button>
             </div>`
          : `<strong>${fmtMoney(target)}</strong>`}
      </div>
      <div class="budget-summary-row"><span>Total engagé</span><strong>${fmtMoney(totalEngaged)}</strong></div>
      <div class="budget-summary-row"><span>Total versé</span><strong>${fmtMoney(totalPaid)}</strong></div>
      <div class="progress-bar"><div class="progress-bar-fill${over ? ' over' : ''}" style="width:${pct}%"></div></div>
    </div>
    <h3 class="dashboard-subtitle">Par catégorie</h3>
    ${renderCategoryTable(categoryStats) || '<p style="color:var(--muted)">Aucun prestataire.</p>'}`;

  if (editable) {
    panel.querySelector('#budget-target-save').addEventListener('click', async () => {
      const newTarget = Number(panel.querySelector('#budget-target-input').value) || 0;
      await saveTarget(newTarget);
      renderBudgetTab();
    });
  }
}
```

- [ ] **Step 4: Manual verification — before nav wiring**

Same throwaway-DOM-hack approach as Task 3 Step 4 (nav wiring lands in Task 6):

1. With the test vendor from Task 3/4 still present (Total 1000, one payment of 300), in the browser console:
   ```js
   import('/admin/budget.js').then(m => { document.getElementById('tab-guests').id = 'tab-budget'; return m.renderBudgetTab(); })
   ```
2. Confirm "Total engagé" shows 1000.00 €, "Total versé" shows 300.00 €.
3. Confirm the category table shows one row for the vendor's category with Engagé 1000.00, Versé 300.00, Reste 700.00.
4. Set the target input to 2000, click Enregistrer, confirm the panel re-renders with the progress bar filled to 15% (300/2000).
5. Check the Firestore console: `settings/budget` doc now has `{ target: 2000 }`.
6. Set target to 100 (below the paid amount), confirm the progress bar segment gets the `over`/red styling.
7. Reset target to 0 or delete the `settings/budget` doc to leave a clean state, reload the page (undoing the DOM hack).

- [ ] **Step 5: Commit**

```bash
git add admin/budget.js
git commit -m "feat: add budget.js with target tracking and category aggregation"
```

---

### Task 6: Wire the "Budget" tab into the nav

**Files:**
- Modify: `admin/sections-registry.js`
- Modify: `admin/index.html`
- Modify: `admin/script.js`

**Interfaces:**
- Consumes: `renderBudgetTab` from `./budget.js` (Task 5).

- [ ] **Step 1: Register the section**

In `admin/sections-registry.js`, add after the `vendors` entry:

```js
  { id: 'budget', label: 'Budget', collection: 'vendors' },
```

Full file:

```js
export const SECTIONS = [
  { id: 'blocks', label: 'Blocs', collection: 'blocks' },
  { id: 'vendors', label: 'Prestataires', collection: 'vendors' },
  { id: 'budget', label: 'Budget', collection: 'vendors' },
  { id: 'guests', label: 'Invités', collection: 'guests' },
  { id: 'events', label: 'Événements', collection: 'events' },
  { id: 'users', label: 'Utilisateurs', collection: 'admins' },
];
```

- [ ] **Step 2: Add the nav button and tab panel in `admin/index.html`**

After the `vendors` nav button added in Task 4 Step 2, add:

```html
      <button class="nav-item" data-section="budget" hidden>
        <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 10v4M2 10h20"/></svg></span> Budget
      </button>
```

After the `tab-vendors` div added in Task 4 Step 2, add:

```html
      <div id="tab-budget" class="tab-panel" hidden></div>
```

Bump the cache-bust version on the script tag again: `?v=13` → `?v=14`.

- [ ] **Step 3: Wire the import and maps in `admin/script.js`**

Add the import after the `vendors.js` import (added in Task 4 Step 3):

```js
import { renderBudgetTab } from './budget.js?v=1';
```

Add to `RENDER_BY_ID`:

```js
const RENDER_BY_ID = {
  blocks: renderBlocksTab,
  vendors: renderVendorsTab,
  budget: renderBudgetTab,
  guests: renderGuestsTab,
  events: renderEventsTab,
  users: renderUsersTab,
};
```

Add to `SLUG_BY_SECTION`:

```js
const SLUG_BY_SECTION = { dashboard: 'dashboard', blocks: 'content', vendors: 'vendors', budget: 'budget', guests: 'guest', events: 'events', users: 'users' };
```

- [ ] **Step 4: Manual verification**

1. In Firestore console, set the logged-in admin's `permissions.budget` to `write` (and confirm `permissions.vendors` is still `write` from Task 4).
2. Reload `/admin/`, confirm both "Prestataires" and "Budget" appear in the sidebar in that order.
3. Click "Budget", confirm URL becomes `/admin/budget/`, summary and category table render using the still-present test vendor data.
4. Edit the target inline, save, confirm it persists across a page reload.
5. Set `permissions.budget` to `read`, reload, confirm the target shows as plain text (no input) while the rest of the tab still renders.
6. Set `permissions.budget` to `none`, reload, confirm the nav item is hidden.
7. Clean up: delete the test vendor doc (via the Prestataires tab's Supprimer button) and reset `settings/budget` if desired, since this was throwaway verification data.

- [ ] **Step 5: Commit**

```bash
git add admin/sections-registry.js admin/index.html admin/script.js
git commit -m "feat: wire Budget tab into admin nav"
```

---

### Task 7: Wire permissions into the Utilisateurs (users) management UI

**Files:**
- None to modify — `admin/users.js` already iterates `SECTIONS` from `sections-registry.js` (see `permSummary()` and `renderPermissionFields()` in `admin/users.js:39-43,93-108`), so the `vendors` and `budget` entries added in Tasks 4 and 6 automatically appear as manageable permission rows for every admin, with no code change needed.

**Interfaces:**
- Consumes: `SECTIONS` from `./sections-registry.js` (already imported in `users.js`).

- [ ] **Step 1: Manual verification that no change is needed**

1. Log in as an admin with `write` on `users`, go to Utilisateurs.
2. Click "Modifier" on any user (or "+ Inviter un utilisateur").
3. Confirm the permissions form now shows six rows: Blocs, Prestataires, Budget, Invités, Événements, Utilisateurs, each with a Aucun/Lecture/Modification select.
4. Set another test admin's `vendors` permission to `read` and `budget` to `none` via this UI, save, confirm the change lands in Firestore (`admins/{uid}.permissions.vendors === 'read'`, `.budget === 'none'`).
5. This step requires no commit — it's confirming existing generic code already covers the new sections correctly.

---

## Post-plan note

Task 1's Firestore rules change must be deployed (`firebase deploy --only firestore:rules`) for any of the write/read behavior to work in production — this is a manual, user-confirmed action since it touches shared production infrastructure, not something to run automatically as part of this plan.
