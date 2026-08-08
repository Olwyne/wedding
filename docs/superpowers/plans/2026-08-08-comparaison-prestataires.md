# Comparaison prestataires Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Prestations tab with a `candidat`/`rejected` vendor status pair and a per-category "preferred candidate" flag, then fix the Budget tab's totals to exclude undecided/rejected vendors while adding a separate "Estimé" figure that includes preferred candidates' quotes.

**Architecture:** Extend `admin/vendors.js`'s existing status enum and row rendering (status filter pills, a "preferred" toggle button/badge) — no new file, no new collection. `admin/budget.js`'s total/category-stat computation gets a status filter and a new estimated-total calculation, consuming the same `loadVendors()` data it already does.

**Tech Stack:** Vanilla JS (ES modules), Firebase Firestore v10 modular SDK, no build step, no test framework (project has none — verification is manual in-browser).

## Global Constraints

- `vendors` doc `status` field extends from `'contacted' | 'booked' | 'paid'` to `'candidat' | 'contacted' | 'booked' | 'paid' | 'rejected'`.
- New optional `vendors` doc field: `preferred: boolean` — only meaningful when `status === 'candidat'`. At most one `preferred: true` vendor per category, enforced client-side only (no Firestore rules change), same rigor level as the existing 2-témoin cap.
- No new Firestore collection, no new permission key — stays under existing `vendors`/`budget` permissions.
- Budget "Engagé" = sum of `total` for vendors with `status` in `contacted`/`booked`/`paid` only (`candidat` and `rejected` excluded — this changes existing behavior, which today sums ALL vendors regardless of status).
- Budget "Estimé" (new) = Engagé + sum of `total` for vendors with `status === 'candidat' && preferred === true`.
- "Versé" (paid) calculation is unchanged — still `paidAmount()` summed over all vendors, unaffected since candidates never have `payments`.
- Category table's "Engagé" column applies the same status filter as the global total. No per-category "Estimé" column (stays global only).
- Follow existing code style: `escapeHtml` on all interpolated user text, `canWrite('vendors')`/`canWrite('budget')` gating, direct Firestore calls, no extra abstraction layers.

---

### Task 1: Extend vendor statuses, add filter pills and preferred-candidate toggle

**Files:**
- Modify: `admin/vendors.js`
- Modify: `admin/styles.css`

**Interfaces:**
- Produces: `loadVendors()` (existing export, unchanged signature — docs may now carry `status: 'candidat'|'rejected'` and `preferred: boolean`). `paidAmount()` (existing export, unchanged — used by Task 2). No new exports needed by Task 2 beyond these two already-existing ones.
- Consumes: nothing new.

- [ ] **Step 1: Extend `STATUS_LABELS` and `STATUS_BADGE`**

In `admin/vendors.js`, change lines 10-11 from:

```js
const STATUS_LABELS = { contacted: 'Contacté', booked: 'Réservé', paid: 'Payé' };
const STATUS_BADGE = { contacted: 'badge-contacted', booked: 'badge-booked', paid: 'badge-paid' };
```

to:

```js
const STATUS_LABELS = { candidat: 'Candidat', contacted: 'Contacté', booked: 'Réservé', paid: 'Payé', rejected: 'Rejeté' };
const STATUS_BADGE = { candidat: 'badge-candidat', contacted: 'badge-contacted', booked: 'badge-booked', paid: 'badge-paid', rejected: 'badge-rejected' };
```

This alone makes the edit panel's status `<select>` show all 5 options, since it's built from `Object.keys(STATUS_LABELS)` (existing code, `admin/vendors.js` around the panel's `#v-status` block — no change needed there).

- [ ] **Step 2: Add filter-pill state and a `markPreferred` helper**

In `admin/vendors.js`, add this module-level state and function right after the `const vendorsCol = collection(db, 'vendors');` line (currently line 8):

```js
let currentFilter = 'all';

const FILTERS = [['all', 'Tous'], ['candidat', 'Candidat'], ['contacted', 'Contacté'], ['booked', 'Réservé'], ['paid', 'Payé'], ['rejected', 'Rejeté']];

async function markPreferred(vendorId, category, vendors) {
  const others = vendors.filter(v => v.id !== vendorId && v.category === category && v.status === 'candidat' && v.preferred);
  await Promise.all(others.map(v => updateDoc(doc(db, 'vendors', v.id), { preferred: false })));
  await updateDoc(doc(db, 'vendors', vendorId), { preferred: true });
}
```

- [ ] **Step 3: Add the preferred badge/button to `renderVendorRow`**

In `admin/vendors.js`, replace the existing `renderVendorRow` function (currently lines 42-63):

```js
function renderVendorRow(v, editable) {
  const status = STATUS_LABELS[v.status] ? v.status : 'contacted';
  const paid = paidAmount(v);
  const remaining = (Number(v.total) || 0) - paid;
  const preferredCell = status === 'candidat'
    ? (v.preferred
        ? '<span class="badge badge-preferred">★ Préféré</span>'
        : (editable ? `<button type="button" class="btn-secondary btn-mark-preferred" data-id="${escapeHtml(v.id)}" data-category="${escapeHtml(v.category || '')}">Marquer préféré</button>` : ''))
    : '';
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
      <td>${preferredCell}</td>
      <td>${fmtMoney(v.total)}</td>
      <td>${fmtMoney(paid)}</td>
      <td>${fmtMoney(remaining)}</td>
      <td>${v.dueDate ? escapeHtml(v.dueDate) : ''}</td>
      <td>${actionsCell}</td>
    </tr>`;
}
```

- [ ] **Step 4: Add the filter pills, a "Préféré" column header, and filtering in `renderVendorsTab`**

In `admin/vendors.js`, replace the existing `renderVendorsTab` function (currently lines 65-114):

```js
export async function renderVendorsTab() {
  const panel = document.getElementById('tab-vendors');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('vendors');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-vendor-btn" class="btn-primary">+ Ajouter une prestation</button>'
    : '';

  let vendors;
  try {
    vendors = await loadVendors();
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }

  const filtered = currentFilter === 'all' ? vendors : vendors.filter(v => (v.status || 'contacted') === currentFilter);

  panel.innerHTML = `
    <div class="vendor-filters">
      ${FILTERS.map(([id, label]) =>
        `<button class="filter-pill ${currentFilter === id ? 'filter-pill-active' : ''}" data-filter="${id}">${label}</button>`
      ).join('')}
    </div>
    <table class="admin-table">
      <thead>
        <tr>
          <th>Catégorie</th><th>Nom</th><th>Statut</th><th>Préféré</th><th>Total</th>
          <th>Versé</th><th>Reste</th><th>Échéance</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.length
          ? filtered.map(v => renderVendorRow(v, editable)).join('')
          : '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:40px">Aucune prestation.</td></tr>'}
      </tbody>
    </table>`;

  panel.querySelectorAll('[data-filter]').forEach(btn =>
    btn.addEventListener('click', () => { currentFilter = btn.dataset.filter; renderVendorsTab(); })
  );

  if (editable) {
    document.getElementById('add-vendor-btn').addEventListener('click', () => openVendorPanel(null, vendors));
    panel.querySelectorAll('.btn-edit-vendor').forEach(btn =>
      btn.addEventListener('click', () => openVendorPanel(btn.dataset.id, vendors))
    );
    panel.querySelectorAll('.btn-delete-vendor').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer cette prestation ?')) return;
        try {
          await deleteDoc(doc(db, 'vendors', btn.dataset.id));
          renderVendorsTab();
        } catch (err) {
          alert(`Erreur : ${err.message}`);
        }
      })
    );
    panel.querySelectorAll('.btn-mark-preferred').forEach(btn =>
      btn.addEventListener('click', async () => {
        try {
          await markPreferred(btn.dataset.id, btn.dataset.category, vendors);
          renderVendorsTab();
        } catch (err) {
          alert(`Erreur : ${err.message}`);
        }
      })
    );
  }
}
```

- [ ] **Step 5: Add CSS for the new badges, filter pills, and preferred button**

Append to `admin/styles.css`:

```css
.vendor-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.badge-candidat{background:#ede9fe;color:#6d28d9}
.badge-rejected{background:#fee2e2;color:#b91c1c}
.badge-preferred{background:#fef9c3;color:#854d0e}
.btn-mark-preferred{white-space:nowrap}
```

- [ ] **Step 6: Manual verification**

With an admin user that has `write` on `vendors`:
- Open Prestations → filter pills (Tous/Candidat/Contacté/Réservé/Payé/Rejeté) appear above the table.
- Click "+ Ajouter une prestation", set Statut to "Candidat", category "Photographe", save → row shows a "Candidat" badge and a "Marquer préféré" button in the Préféré column (Total/Versé/Reste/Échéance untouched).
- Add a second candidate in the same category "Photographe" → also shows "Marquer préféré".
- Click "Marquer préféré" on the first one → badge becomes "★ Préféré", button disappears for that row.
- Click "Marquer préféré" on the second one → second becomes "★ Préféré", first automatically reverts to showing the "Marquer préféré" button again (only one preferred per category).
- Change the first candidate's Statut to "Rejeté" via the edit panel, save → badge shows "Rejeté", no Préféré cell content (status no longer `candidat`).
- Click each filter pill → table filters correctly; "Tous" shows everything.
- Switch to a `read`-only user on `vendors` → filter pills still work (view-only filtering isn't gated), no "Marquer préféré" button appears on any candidat row, no edit/delete actions.
- Open the browser console throughout — no errors.

- [ ] **Step 7: Commit**

```bash
git add admin/vendors.js admin/styles.css
git commit -m "feat: add candidat/rejected vendor statuses with preferred-candidate marking"
```

---

### Task 2: Budget totals exclude undecided/rejected vendors, add "Estimé" total

**Files:**
- Modify: `admin/budget.js`

**Interfaces:**
- Consumes: `loadVendors()`, `paidAmount()` from `admin/vendors.js` (existing exports, unchanged signatures — Task 1 only changed the data those functions return, not their shape). `CATEGORIES` from `admin/vendors.js` (existing export, unchanged).
- Produces: `renderBudgetTab()` (existing export, same signature — this task replaces its body). Last task — nothing consumed later.

- [ ] **Step 1: Add an `ENGAGED_STATUSES` filter and use it in `computeCategoryStats`**

In `admin/budget.js`, add this constant right after the `PENCIL_ICON` declaration (currently line 9):

```js
const ENGAGED_STATUSES = ['contacted', 'booked', 'paid'];
```

Then replace `computeCategoryStats` (currently lines 42-59):

```js
function computeCategoryStats(vendors, categoryTargets) {
  const byCategory = {};
  CATEGORIES.forEach(cat => {
    byCategory[cat] = { category: cat, engaged: 0, paid: 0 };
  });
  vendors.forEach(v => {
    if (!ENGAGED_STATUSES.includes(v.status)) return;
    const cat = v.category || 'Autre';
    if (!byCategory[cat]) byCategory[cat] = { category: cat, engaged: 0, paid: 0 };
    byCategory[cat].engaged += Number(v.total) || 0;
    byCategory[cat].paid += paidAmount(v);
  });
  Object.keys(categoryTargets).forEach(cat => {
    if (!byCategory[cat]) byCategory[cat] = { category: cat, engaged: 0, paid: 0 };
  });
  return Object.values(byCategory)
    .map(c => ({ ...c, target: Number(categoryTargets[c.category]) || 0 }))
    .sort((a, b) => a.category.localeCompare(b.category));
}
```

Note: `paid` (versé) is still computed from `paidAmount(v)` only for engaged-status vendors now — this is a minor behavior tightening (a `paid`-status vendor was already required to be counted; a `candidat`/`rejected` vendor should never carry `payments` in practice, so this doesn't change real-world totals, it just makes the filter consistent between `engaged` and `paid`).

- [ ] **Step 2: Compute `totalEngaged`, `totalEstimated`, and `totalPaid` with the new filter, add the "Estimé" summary row**

In `admin/budget.js`, inside `renderBudgetTab`, replace these two lines (currently lines 119-120):

```js
  const totalEngaged = vendors.reduce((sum, v) => sum + (Number(v.total) || 0), 0);
  const totalPaid = vendors.reduce((sum, v) => sum + paidAmount(v), 0);
```

with:

```js
  const totalEngaged = vendors
    .filter(v => ENGAGED_STATUSES.includes(v.status))
    .reduce((sum, v) => sum + (Number(v.total) || 0), 0);
  const totalPreferred = vendors
    .filter(v => v.status === 'candidat' && v.preferred)
    .reduce((sum, v) => sum + (Number(v.total) || 0), 0);
  const totalEstimated = totalEngaged + totalPreferred;
  const totalPaid = vendors
    .filter(v => ENGAGED_STATUSES.includes(v.status))
    .reduce((sum, v) => sum + paidAmount(v), 0);
```

Then, inside `renderView`, find this block (currently lines 150-151):

```js
        <div class="budget-summary-row"><span>Total engagé</span><strong>${fmtMoney(totalEngaged)}</strong></div>
        <div class="budget-summary-row"><span>Total versé</span><strong>${fmtMoney(totalPaid)}</strong></div>
```

and insert a new row between them:

```js
        <div class="budget-summary-row"><span>Total engagé</span><strong>${fmtMoney(totalEngaged)}</strong></div>
        <div class="budget-summary-row"><span>Total estimé</span><strong>${fmtMoney(totalEstimated)}</strong></div>
        <div class="budget-summary-row"><span>Total versé</span><strong>${fmtMoney(totalPaid)}</strong></div>
```

- [ ] **Step 3: Manual verification**

With an admin user that has `write` on `budget` and at least one `candidat` vendor marked `preferred` (from Task 1's verification) plus one `contacted`/`booked`/`paid` vendor:
- Open Budget tab → "Total engagé" no longer includes the candidat/rejected vendors' amounts (only contacted/booked/paid sum). Confirm by comparing against what the Prestations tab shows per vendor.
- New "Total estimé" row appears between "Total engagé" and "Total versé", showing engagé + the preferred candidate's `total`.
- Mark a different candidate as preferred (unmarking the first, per Task 1's mutual-exclusion logic) → reload Budget tab → "Total estimé" reflects the new preferred candidate's amount instead of the old one.
- Set a candidat vendor's status to "Rejeté" → reload Budget → confirm it was never counted in either Engagé or Estimé (it wasn't preferred, so no change expected, but double-check no regression).
- Category table ("Par catégorie") → "Engagé" column for a category containing only candidat/rejected vendors shows `0,00 €`, not their totals.
- Switch to a `read`-only user on `budget` → all totals still display correctly (read path unaffected by this change).
- Open the browser console throughout — no errors.

- [ ] **Step 4: Commit**

```bash
git add admin/budget.js
git commit -m "fix: exclude candidat/rejected vendors from budget totals, add estimated total"
```

---

## Post-plan note

No Firestore rules changes are needed — `status` and `preferred` are just additional fields on the existing `vendors` collection, already covered by the existing `match /vendors/{vendorId}` rule block (read gated by `vendors`/`budget` permission, write gated by `vendors` permission only, unchanged by this plan).
