# Déroulé jour-J Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin "Déroulé jour-J" tab: an internal, single-language chronological timeline of the wedding day (setup, arrivals, ceremony, etc.), each line with an optional responsible person (vendor or guest), a "done" toggle, and a print view for handing to vendors/witnesses.

**Architecture:** New `admin/dayof.js` module following the existing per-section pattern (`export async function renderDayOfTab()` owning its `#tab-dayof` subtree, mirroring `events.js`/`witnesses.js`). Data lives in a new Firestore collection `runOfShow`. Registered through `admin/sections-registry.js`, which auto-wires nav visibility, routing, and per-user permissions. No shared module needed — this tab is self-contained (unlike `tasks-shared.js` in the todo/calendar design, which is shared by two tabs).

**Tech Stack:** Vanilla JS (ES modules), Firebase Firestore v10 modular SDK, no build step, no test framework (project has none — verification is manual in-browser). Print via the browser's native `window.print()` + `@media print` CSS — no PDF library.

## Global Constraints

- New Firestore collection `runOfShow`: `{ time: 'HH:MM', title, location, responsibleType: 'none'|'vendor'|'guest', responsibleId, notes, done: boolean }`.
- Single permission key `dayof` pointing at `runOfShow` — standard `canRead`/`canWrite` gating.
- No FR/ZH bilingual fields (internal use only) — distinct from the public `events` collection.
- Sorted by `time` only, no drag-reorder.
- Responsible picker offers the full `guests` list and the full `vendors` list (not filtered to witnesses/wedding party).
- Print hides nav, action buttons, the "Fait"/"Actions" columns — shows only Heure/Titre/Lieu/Responsable/Notes.
- Follow existing code style: `escapeHtml` on all interpolated user text, `canRead`/`canWrite` gating from `admin/permissions.js`, direct Firestore calls in the module (no extra abstraction layers).

---

### Task 1: Register the section, wire nav/routing/rules, stub panel

**Files:**
- Modify: `admin/sections-registry.js`
- Modify: `admin/index.html:60-65` (nav button), `admin/index.html:85-86` (tab panel)
- Modify: `admin/script.js`
- Modify: `firestore.rules`
- Create: `admin/dayof.js` (stub)

**Interfaces:**
- Produces: `renderDayOfTab()` — async function, no args, populates `#tab-dayof`. (Stub body here; full implementation in Task 2.)

- [ ] **Step 1: Add the section to the registry**

Edit `admin/sections-registry.js`:

```js
export const SECTIONS = [
  { id: 'blocks', label: 'Blocs', collection: 'blocks' },
  { id: 'vendors', label: 'Prestations', collection: 'vendors' },
  { id: 'budget', label: 'Budget', collection: 'vendors' },
  { id: 'guests', label: 'Invités', collection: 'guests' },
  { id: 'tables', label: 'Tables', collection: 'tables' },
  { id: 'witnesses', label: 'Témoins', collection: 'guests' },
  { id: 'events', label: 'Événements', collection: 'events' },
  { id: 'dayof', label: 'Déroulé jour-J', collection: 'runOfShow' },
  { id: 'users', label: 'Utilisateurs', collection: 'admins' },
];
```

- [ ] **Step 2: Add the nav button and tab panel to the HTML**

In `admin/index.html`, insert this nav item right after the "Événements" `nav-item` block (after line 62's closing `</button>`, before the "Utilisateurs" button):

```html
      <button class="nav-item" data-section="dayof" hidden>
        <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></span> Déroulé jour-J
      </button>
```

And insert this tab panel right after `<div id="tab-events" class="tab-panel" hidden></div>` (line 85), before `<div id="tab-users" ...>`:

```html
      <div id="tab-dayof" class="tab-panel" hidden></div>
```

- [ ] **Step 3: Create the stub module**

Create `admin/dayof.js`:

```js
// admin/dayof.js
import { canWrite } from './permissions.js';

export async function renderDayOfTab() {
  const panel = document.getElementById('tab-dayof');
  document.getElementById('section-action').innerHTML = '';
  const editable = canWrite('dayof');
  panel.innerHTML = `<p style="padding:20px;color:var(--muted)">Déroulé jour-J — à venir (editable: ${editable})</p>`;
}
```

- [ ] **Step 4: Wire it into script.js**

Edit `admin/script.js`. Add import after the `renderEventsTab` import:

```js
import { renderDayOfTab } from './dayof.js?v=1';
```

Add to `RENDER_BY_ID` (after `events: renderEventsTab,`):

```js
  dayof: renderDayOfTab,
```

Update `SLUG_BY_SECTION`:

```js
const SLUG_BY_SECTION = { dashboard: 'dashboard', blocks: 'content', vendors: 'vendors', budget: 'budget', guests: 'guest', tables: 'tables', witnesses: 'witnesses', events: 'events', dayof: 'dayof', users: 'users' };
```

- [ ] **Step 5: Update firestore.rules**

Add a new `runOfShow` match block right after the `tables` block (after its closing `}`, before `match /settings/budget`):

```
    match /runOfShow/{itemId} {
      allow read: if perm('dayof') in ['read', 'write'];
      allow write: if perm('dayof') == 'write';
    }
```

The edit panel (built in Task 2) lets a user link a line to a guest or vendor — which means `dayof` users need read access to `guests` and `vendors` even without permission on those sections directly. Extend the existing rules the same way `tables`/`witnesses` already extend the `guests` list rule:

In the `guests` block, change:
```
      allow list: if perm('guests') in ['read', 'write'] || perm('witnesses') in ['read', 'write'] || perm('tables') in ['read', 'write'];
```
to:
```
      allow list: if perm('guests') in ['read', 'write'] || perm('witnesses') in ['read', 'write'] || perm('tables') in ['read', 'write'] || perm('dayof') in ['read', 'write'];
```

In the `vendors` block, change:
```
      allow read: if perm('vendors') in ['read', 'write'] || perm('budget') in ['read', 'write'];
```
to:
```
      allow read: if perm('vendors') in ['read', 'write'] || perm('budget') in ['read', 'write'] || perm('dayof') in ['read', 'write'];
```

Deploy the updated rules:

```bash
firebase deploy --only firestore:rules
```

- [ ] **Step 6: Manual verification**

Open the admin locally (through your existing local Firebase-hosting preview flow, or `preview_start` on the project's dev command). Log in, confirm:
- "Déroulé jour-J" appears in the sidebar between "Événements" and "Utilisateurs" — only if your logged-in admin has `read`+ on `dayof` (brand new permission key defaults to `none`; use the Utilisateurs tab, or set `permissions.dayof = 'write'` on your own admin doc in the Firestore console).
- Clicking it shows the stub text, URL becomes `/admin/dayof/`.
- Reloading that URL directly lands back on the Déroulé jour-J tab.
- In the Firestore console, confirm the rules deployed (Rules tab shows the new `runOfShow` match block and the two extended `list`/`read` lines).

- [ ] **Step 7: Commit**

```bash
git add admin/sections-registry.js admin/index.html admin/script.js admin/dayof.js firestore.rules
git commit -m "feat: register Déroulé jour-J admin section with stub panel"
```

---

### Task 2: List, create/edit panel, quick "done" toggle, delete

**Files:**
- Modify: `admin/dayof.js` (full render logic, replaces stub)

**Interfaces:**
- Consumes: `loadGuests()` from `admin/guests.js` (existing, returns `Array<{id, name, ...}>`), `loadVendors()` from `admin/vendors.js` (existing, returns `Array<{id, name, ...}>`), `canWrite('dayof')` from `admin/permissions.js`.
- Produces: `renderDayOfTab()` (already declared in Task 1's stub; this task replaces the body). Nothing new consumed by later tasks — Task 3 only adds CSS and a print button hook inside this same file.

- [ ] **Step 1: Replace dayof.js with the full implementation**

Replace the entire contents of `admin/dayof.js`:

```js
// admin/dayof.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc,
  query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';
import { loadGuests } from './guests.js?v=5';
import { loadVendors } from './vendors.js?v=6';

const dayOfCol = collection(db, 'runOfShow');

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadRunOfShow() {
  const snap = await getDocs(query(dayOfCol, orderBy('time')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function renderDayOfTab() {
  const panel = document.getElementById('tab-dayof');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('dayof');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-dayof-btn" class="btn-primary">+ Ajouter une ligne</button>'
    : '';

  const [items, guests, vendors] = await Promise.all([
    loadRunOfShow(), loadGuests(), loadVendors()
  ]);
  const guestsById = new Map(guests.map(g => [g.id, g]));
  const vendorsById = new Map(vendors.map(v => [v.id, v]));

  const responsibleLabel = (item) => {
    if (item.responsibleType === 'guest') return guestsById.get(item.responsibleId)?.name || '—';
    if (item.responsibleType === 'vendor') return vendorsById.get(item.responsibleId)?.name || '—';
    return '—';
  };

  panel.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Heure</th><th>Titre</th><th>Lieu</th><th>Responsable</th><th>Notes</th>
          <th>Fait</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items.length ? items.map(item => `
          <tr>
            <td>${escapeHtml(item.time)}</td>
            <td>${escapeHtml(item.title)}</td>
            <td>${escapeHtml(item.location || '—')}</td>
            <td>${escapeHtml(responsibleLabel(item))}</td>
            <td>${escapeHtml(item.notes || '—')}</td>
            <td><input type="checkbox" class="dayof-quick-done" data-id="${item.id}" ${item.done ? 'checked' : ''} ${editable ? '' : 'disabled'}></td>
            <td>${editable
              ? `<div class="table-actions">
                   <button class="btn-secondary btn-edit-dayof" data-id="${item.id}">Modifier</button>
                   <button class="btn-danger btn-delete-dayof" data-id="${item.id}">Supprimer</button>
                 </div>`
              : ''}</td>
          </tr>`).join('')
          : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:40px">Aucune ligne.</td></tr>'}
      </tbody>
    </table>`;

  if (editable) {
    document.getElementById('add-dayof-btn').addEventListener('click', () =>
      openDayOfPanel(null, items, guests, vendors)
    );
    panel.querySelectorAll('.btn-edit-dayof').forEach(btn =>
      btn.addEventListener('click', () => openDayOfPanel(btn.dataset.id, items, guests, vendors))
    );
    panel.querySelectorAll('.btn-delete-dayof').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer cette ligne ?')) return;
        await deleteDoc(doc(db, 'runOfShow', btn.dataset.id));
        renderDayOfTab();
      })
    );
    panel.querySelectorAll('.dayof-quick-done').forEach(cb =>
      cb.addEventListener('change', async () => {
        await updateDoc(doc(db, 'runOfShow', cb.dataset.id), { done: cb.checked });
        renderDayOfTab();
      })
    );
  }
}

function openDayOfPanel(id, items, guests, vendors) {
  const item = id ? items.find(i => i.id === id) : null;
  const isNew = !item;
  const v = (key, fallback = '') => item?.[key] ?? fallback;

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  const linkOptionsFor = (type, selectedId) => {
    if (type === 'guest') return guests.map(g => `<option value="${escapeHtml(g.id)}" ${selectedId === g.id ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
    if (type === 'vendor') return vendors.map(ve => `<option value="${escapeHtml(ve.id)}" ${selectedId === ve.id ? 'selected' : ''}>${escapeHtml(ve.name)}</option>`).join('');
    return '';
  };

  const responsibleType = v('responsibleType', 'none');
  const responsibleId = v('responsibleId', '');

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${isNew ? 'Nouvelle ligne' : 'Modifier la ligne'}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      <label class="field"><span>Heure</span><input id="dayof-time" type="time" value="${escapeHtml(v('time'))}" required></label>
      <label class="field"><span>Titre</span><input id="dayof-title" value="${escapeHtml(v('title'))}" required></label>
      <label class="field"><span>Lieu</span><input id="dayof-location" value="${escapeHtml(v('location'))}"></label>
      <label class="field"><span>Responsable</span>
        <select id="dayof-responsible-type">
          <option value="none" ${responsibleType === 'none' ? 'selected' : ''}>Aucun</option>
          <option value="vendor" ${responsibleType === 'vendor' ? 'selected' : ''}>Prestataire</option>
          <option value="guest" ${responsibleType === 'guest' ? 'selected' : ''}>Invité</option>
        </select>
      </label>
      <label class="field" id="dayof-responsible-id-field" ${responsibleType === 'none' ? 'hidden' : ''}>
        <span>Choisir</span>
        <select id="dayof-responsible-id">${linkOptionsFor(responsibleType, responsibleId)}</select>
      </label>
      <label class="field"><span>Notes</span><textarea id="dayof-notes">${escapeHtml(v('notes'))}</textarea></label>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px">
        <input id="dayof-done" type="checkbox" ${v('done') ? 'checked' : ''}><span>Fait</span>
      </label>
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">${isNew ? 'Créer' : 'Enregistrer'}</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  panelEl.querySelector('#dayof-responsible-type').addEventListener('change', (e) => {
    const type = e.target.value;
    panelEl.querySelector('#dayof-responsible-id-field').hidden = type === 'none';
    panelEl.querySelector('#dayof-responsible-id').innerHTML = linkOptionsFor(type, null);
  });

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const get = (sel) => panelEl.querySelector(sel).value;
    const title = get('#dayof-title').trim();
    const time = get('#dayof-time');
    if (!title || !time) return;
    const responsibleTypeVal = get('#dayof-responsible-type');
    const data = {
      time,
      title,
      location: get('#dayof-location'),
      responsibleType: responsibleTypeVal,
      responsibleId: responsibleTypeVal === 'none' ? null : (get('#dayof-responsible-id') || null),
      notes: get('#dayof-notes'),
      done: panelEl.querySelector('#dayof-done').checked,
    };
    if (id) {
      await updateDoc(doc(db, 'runOfShow', id), data);
    } else {
      await addDoc(dayOfCol, data);
    }
    close();
    renderDayOfTab();
  });
}
```

- [ ] **Step 2: Manual verification**

With an admin user that has `write` on `dayof`:
- Click "+ Ajouter une ligne" → panel opens. Fill Heure "07:00", Titre "Fleuriste arrive au lieu", save → row appears in the table sorted correctly if you add a second line with an earlier/later time.
- Edit that line: set Lieu, Responsable → Prestataire → pick one from the dropdown (populated from `vendors`), save → row updates, "Responsable" column shows the vendor's name.
- Create another line with Responsable → Invité → pick a guest, save → "Responsable" column shows the guest's name.
- Click the row's "Fait" checkbox → toggles immediately (no panel needed), state persists on reload.
- Click "Supprimer" on a line, confirm the browser dialog → row disappears, confirm in Firestore console the doc is gone.
- Switch to a `read`-only user on `dayof` (or remove write) → "+ Ajouter" button and row-level Modifier/Supprimer absent, "Fait" checkboxes present but disabled, table still shows data.

- [ ] **Step 3: Commit**

```bash
git add admin/dayof.js
git commit -m "feat: implement Déroulé jour-J list, panel, and quick done toggle"
```

---

### Task 3: Print view

**Files:**
- Modify: `admin/dayof.js`
- Modify: `admin/styles.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks (last task).

- [ ] **Step 1: Add the print button and `no-print` classes**

In `admin/dayof.js`, inside `renderDayOfTab()`, change the `panel.innerHTML` assignment to add a print button before the table and `no-print` classes on the "Fait"/"Actions" header and data cells:

```js
  panel.innerHTML = `
    <button id="print-dayof-btn" class="btn-secondary no-print" style="margin-bottom:16px">Imprimer</button>
    <table class="admin-table">
      <thead>
        <tr>
          <th>Heure</th><th>Titre</th><th>Lieu</th><th>Responsable</th><th>Notes</th>
          <th class="no-print">Fait</th><th class="no-print">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items.length ? items.map(item => `
          <tr>
            <td>${escapeHtml(item.time)}</td>
            <td>${escapeHtml(item.title)}</td>
            <td>${escapeHtml(item.location || '—')}</td>
            <td>${escapeHtml(responsibleLabel(item))}</td>
            <td>${escapeHtml(item.notes || '—')}</td>
            <td class="no-print"><input type="checkbox" class="dayof-quick-done" data-id="${item.id}" ${item.done ? 'checked' : ''} ${editable ? '' : 'disabled'}></td>
            <td class="no-print">${editable
              ? `<div class="table-actions">
                   <button class="btn-secondary btn-edit-dayof" data-id="${item.id}">Modifier</button>
                   <button class="btn-danger btn-delete-dayof" data-id="${item.id}">Supprimer</button>
                 </div>`
              : ''}</td>
          </tr>`).join('')
          : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:40px">Aucune ligne.</td></tr>'}
      </tbody>
    </table>`;
```

Right after that `panel.innerHTML = ...` assignment (before the `if (editable) { ... }` block), add:

```js
  document.getElementById('print-dayof-btn').addEventListener('click', () => window.print());
```

- [ ] **Step 2: Add print CSS**

Append to `admin/styles.css`:

```css
@media print {
  .sidebar, #section-action, .no-print { display: none !important; }
  .content-area { margin: 0; padding: 0; }
  .admin-table { border: 1px solid #000; }
  .admin-table th, .admin-table td { border: 1px solid #ccc; }
}
```

- [ ] **Step 3: Manual verification**

On the Déroulé jour-J tab with a few lines already created:
- Click "Imprimer" → the browser's print dialog opens. In the print preview, confirm the sidebar, the "+ Ajouter une ligne" button, and the "Fait"/"Actions" columns are all absent, and only Heure/Titre/Lieu/Responsable/Notes columns show, sorted by time.
- Cancel the print dialog, confirm the live page (sidebar, buttons, checkboxes) is unaffected — the `no-print` rule only applies inside `@media print`.
- Switch to a `read`-only user on `dayof` → "Imprimer" button still visible and works (print button is not gated behind `canWrite`).

- [ ] **Step 4: Commit**

```bash
git add admin/dayof.js admin/styles.css
git commit -m "feat: add print view for Déroulé jour-J"
```

---

## Post-plan note

`admin/users.js` already iterates `SECTIONS` from `sections-registry.js` for the permissions grid UI — no task needed there beyond Task 1's registry entry; `dayof` appears automatically as another permission row for every admin user. Existing admins default to `none` (same as any brand-new section), so grant `read`/`write` explicitly via the Utilisateurs tab (or Firestore console) to whoever should see this tab.
