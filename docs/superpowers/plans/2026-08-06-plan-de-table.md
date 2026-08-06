# Onglet "Tables" (plan de salle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Tables" admin tab where the couple can create round tables, position them freely on a canvas, and drag confirmed/pending/declined guests onto tables to plan seating.

**Architecture:** New Firestore collection `tables` (`{ name, capacity, x, y, guestIds[] }`). New module `admin/tables.js` following the exact pattern of `admin/guests.js`/`admin/budget.js` (a `render<Section>Tab()` export wired into `admin/script.js`'s `RENDER_BY_ID`/`SLUG_BY_SECTION`, gated by `canRead`/`canWrite('tables')`). The canvas is plain HTML — absolutely-positioned circular `<div>`s inside a relatively-positioned container — using native HTML5 Drag and Drop (`draggable`, `dragstart`, `dragover`, `drop`) for both guest→table assignment and table repositioning. No SVG, no external libraries.

**Tech Stack:** Vanilla ES modules (no bundler/build step), Firebase Firestore JS SDK v10.7.1 (loaded from `gstatic.com` CDN, same as every other `admin/*.js` file), served via nginx/Docker (`docker-compose.yml`).

## Global Constraints

- No test framework exists in this repo (no `package.json`, no test files anywhere). Verification is: `node --check <file>` for syntax on every JS file touched, plus manual browser verification via `docker compose up -d` → `http://localhost:8090/admin/tables/` (real Firebase backend, not an emulator — log in with an admin account that has `permissions.tables = 'write'` on its `admins/{uid}` doc; set it manually in the Firebase console if it doesn't exist yet).
- Follow existing `admin/*.js` conventions exactly: local `escapeHtml()` helper duplicated per file (not shared — matches `guests.js`/`vendors.js`/`budget.js`), `canWrite('tables')`/`canRead('tables')` from `admin/permissions.js`, panel-overlay pattern for modals (see `guests.js` `openGuestPanel`), version query strings (`?v=N`) bumped on every import when a file's exports change.
- One guest doc (`guests/{id}`) is always assigned to at most one table as an indivisible block — never split a guest's party across tables.
- Overbooking a table is allowed, never blocked — show a warning badge instead (same UX as the existing budget-over-allocation warning in `admin/budget.js`).
- French UI copy throughout, matching existing tabs.

---

### Task 1: Firestore rules, data layer, and nav wiring (empty-state tab)

**Files:**
- Modify: `firestore.rules`
- Create: `admin/tables.js`
- Modify: `admin/sections-registry.js`
- Modify: `admin/index.html`
- Modify: `admin/script.js`

**Interfaces:**
- Produces (from `admin/tables.js`, consumed by later tasks and by `admin/script.js`):
  - `export async function loadTables()` → `Promise<Array<{id, name, capacity, x, y, guestIds: string[]}>>`
  - `export function guestPartySize(guest)` → `number` (1 + adults + children)
  - `export async function createTable(name, capacity, x, y)` → `Promise<string>` (new doc id)
  - `export async function updateTablePosition(tableId, x, y)` → `Promise<void>`
  - `export async function assignGuestToTable(tables, guestId, targetTableId)` → `Promise<void>`
  - `export async function removeGuestFromTable(tableId, guestId, guestIds)` → `Promise<void>`
  - `export async function deleteTable(tableId)` → `Promise<void>`
  - `export function occupancy(table, guestById)` → `number`
  - `export async function renderTablesTab()` → `Promise<void>` (entry point, mounts into `#tab-tables`)

- [ ] **Step 1: Add `tables` collection rules**

Edit `firestore.rules`. Insert a new `match` block right after the `match /vendors/{vendorId} { ... }` block (after line 33, before `match /settings/budget`):

```
    match /tables/{tableId} {
      allow read: if perm('tables') in ['read', 'write'];
      allow write: if perm('tables') == 'write';
    }
```

- [ ] **Step 2: Deploy rules**

Run: `firebase deploy --only firestore:rules`
Expected: `✔  Deploy complete!` (requires the developer to be logged into the Firebase CLI with access to this project — if that's not available in this environment, skip this step and note it in the task summary; the rule change is still committed to git).

- [ ] **Step 3: Create `admin/tables.js` with the data layer and an empty-state shell**

```js
// admin/tables.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';

const tablesCol = collection(db, 'tables');

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export async function loadTables() {
  const snap = await getDocs(tablesCol);
  return snap.docs.map(d => ({ id: d.id, guestIds: [], ...d.data() }));
}

export function guestPartySize(guest) {
  return 1 + (guest.rsvp?.adults ?? 0) + (guest.rsvp?.children ?? 0);
}

export async function createTable(name, capacity, x, y) {
  const ref = await addDoc(tablesCol, { name, capacity, x, y, guestIds: [] });
  return ref.id;
}

export async function updateTablePosition(tableId, x, y) {
  await updateDoc(doc(db, 'tables', tableId), { x, y });
}

export async function assignGuestToTable(tables, guestId, targetTableId) {
  const updates = [];
  for (const t of tables) {
    const has = t.guestIds.includes(guestId);
    if (t.id === targetTableId && !has) {
      updates.push(updateDoc(doc(db, 'tables', t.id), { guestIds: [...t.guestIds, guestId] }));
    } else if (t.id !== targetTableId && has) {
      updates.push(updateDoc(doc(db, 'tables', t.id), { guestIds: t.guestIds.filter(id => id !== guestId) }));
    }
  }
  await Promise.all(updates);
}

export async function removeGuestFromTable(tableId, guestId, guestIds) {
  await updateDoc(doc(db, 'tables', tableId), { guestIds: guestIds.filter(id => id !== guestId) });
}

export async function deleteTable(tableId) {
  await deleteDoc(doc(db, 'tables', tableId));
}

export function occupancy(table, guestById) {
  return (table.guestIds || []).reduce((sum, id) => {
    const g = guestById[id];
    return sum + (g ? guestPartySize(g) : 0);
  }, 0);
}

export async function renderTablesTab() {
  const panel = document.getElementById('tab-tables');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';
  document.getElementById('section-action').innerHTML = '';

  let tables;
  try {
    tables = await loadTables();
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }

  panel.innerHTML = tables.length
    ? '<p style="padding:20px;color:var(--muted)">Tables chargées (rendu complet à venir).</p>'
    : '<p style="padding:20px;color:var(--muted)">Aucune table pour le moment.</p>';
}
```

- [ ] **Step 4: Syntax-check the new file**

Run: `node --check admin/tables.js`
Expected: no output (exit code 0)

- [ ] **Step 5: Register the section**

Edit `admin/sections-registry.js`, add a new entry after `guests` (before `witnesses`):

```js
  { id: 'guests', label: 'Invités', collection: 'guests' },
  { id: 'tables', label: 'Tables', collection: 'tables' },
  { id: 'witnesses', label: 'Témoins', collection: 'guests' },
```

- [ ] **Step 6: Add the nav item and tab panel to `admin/index.html`**

After the `witnesses` `<button class="nav-item" ...>` block (ends at line 56), add:

```html
      <button class="nav-item" data-section="tables" hidden>
        <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg></span> Tables
      </button>
```

After the `<div id="tab-witnesses" ...>` line, add:

```html
      <div id="tab-tables" class="tab-panel" hidden></div>
```

Bump the script cache-buster on the last line: change `src="/admin/script.js?v=17"` to `src="/admin/script.js?v=18"`.

- [ ] **Step 7: Wire the section into `admin/script.js`**

Add the import (after the `guests.js` import line):

```js
import { renderTablesTab } from './tables.js?v=1';
```

Add to `RENDER_BY_ID` (after `guests: renderGuestsTab,`):

```js
  tables: renderTablesTab,
```

Add to `SLUG_BY_SECTION` (after `guests: 'guest',`):

```js
tables: 'tables',
```

- [ ] **Step 8: Manual verification**

Run: `docker compose up -d --build`
Then open `http://localhost:8090/admin/tables/` in a browser, log in with an account whose `admins/{uid}.permissions.tables` is `'read'` or `'write'`.
Expected: sidebar shows a "Tables" nav item, clicking it (or the direct URL) shows "Aucune table pour le moment." with no console errors.

- [ ] **Step 9: Commit**

```bash
git add firestore.rules admin/tables.js admin/sections-registry.js admin/index.html admin/script.js
git commit -m "feat: add Tables section shell with data layer and Firestore rules"
```

---

### Task 2: Add table + canvas rendering

**Files:**
- Modify: `admin/tables.js`
- Modify: `admin/styles.css`

**Interfaces:**
- Consumes: everything from Task 1 (`loadTables`, `createTable`, `occupancy`, `escapeHtml` — internal to the file).
- Produces: `renderTablesTab()` now renders a "+ Ajouter une table" button in `#section-action` and a `.tables-canvas` container with one `.table-circle` div per table. `openAddTablePanel(onCreated)` (internal, not exported) opens the create-table mini panel.

- [ ] **Step 1: Add canvas + table-circle CSS**

Append to `admin/styles.css`:

```css
.tables-canvas{position:relative;min-height:520px;background:var(--accent-light);border-radius:8px;overflow:auto}
.table-circle{position:absolute;width:84px;height:84px;border-radius:50%;background:#fff;border:2px solid var(--accent);display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:11px;color:#333;cursor:grab;user-select:none;text-align:center;padding:4px;box-sizing:border-box}
.table-circle.over-capacity{border-color:var(--danger);background:#fff5f5}
.table-circle .table-circle-name{font-weight:600;margin-bottom:2px}
.table-circle .table-circle-count{color:var(--muted);font-size:10px}
.table-circle.over-capacity .table-circle-count{color:var(--danger)}
```

- [ ] **Step 2: Replace `renderTablesTab` body and add table creation**

In `admin/tables.js`, replace the entire `export async function renderTablesTab() { ... }` function (and everything after it, since this is the end of the file) with:

```js
function renderTableCircle(table, guestById) {
  const count = occupancy(table, guestById);
  const over = count > (Number(table.capacity) || 0);
  return `
    <div class="table-circle${over ? ' over-capacity' : ''}" data-id="${escapeHtml(table.id)}"
         style="left:${table.x}px;top:${table.y}px" draggable="true">
      <div class="table-circle-name">${escapeHtml(table.name)}</div>
      <div class="table-circle-count">${count}/${table.capacity}${over ? ' ⚠' : ''}</div>
    </div>`;
}

function openAddTablePanel(onCreated) {
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';
  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>Nouvelle table</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      <label class="field">
        <span>Nom</span>
        <input id="table-name" value="Table" required>
      </label>
      <label class="field">
        <span>Capacité</span>
        <input id="table-capacity" type="number" min="1" step="1" value="8" required>
      </label>
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">Créer</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;
  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const name = panelEl.querySelector('#table-name').value.trim();
    const capacity = Number(panelEl.querySelector('#table-capacity').value) || 1;
    if (!name) return;
    const x = 20 + Math.round(Math.random() * 300);
    const y = 20 + Math.round(Math.random() * 200);
    await createTable(name, capacity, x, y);
    close();
    onCreated();
  });
}

export async function renderTablesTab() {
  const panel = document.getElementById('tab-tables');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('tables');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-table-btn" class="btn-primary">+ Ajouter une table</button>'
    : '';

  let tables;
  try {
    tables = await loadTables();
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }

  const guestById = {};

  panel.innerHTML = `<div class="tables-canvas" id="tables-canvas">${tables.map(t => renderTableCircle(t, guestById)).join('')}</div>`;

  if (editable) {
    document.getElementById('add-table-btn').addEventListener('click', () =>
      openAddTablePanel(() => renderTablesTab())
    );
  }
}
```

- [ ] **Step 3: Syntax-check**

Run: `node --check admin/tables.js`
Expected: no output (exit code 0)

- [ ] **Step 4: Manual verification**

Run: `docker compose up -d --build` (rebuild to pick up changes), open `http://localhost:8090/admin/tables/`.
Expected: "+ Ajouter une table" button visible for a write-permission account. Clicking it opens a panel; entering a name/capacity and clicking "Créer" adds a circle showing `Table X` and `0/8` at a random position inside the canvas, persisted (reload the page — the table is still there).

- [ ] **Step 5: Commit**

```bash
git add admin/tables.js admin/styles.css
git commit -m "feat: add table creation and canvas rendering"
```

---

### Task 3: Guest list panel with RSVP status filter

**Files:**
- Modify: `admin/tables.js`
- Modify: `admin/styles.css`

**Interfaces:**
- Consumes: `loadGuests` from `admin/guests.js` (`export async function loadGuests()` → `Promise<Array<{id, name, rsvp, ...}>>`, already exists), `guestPartySize` (Task 1).
- Produces: `renderTablesTab()` now lays out a two-column `.tables-layout` (`.tables-guest-list` + `.tables-canvas`) and tracks a status filter in local state. Guest cards: `<div class="guest-card" draggable="true" data-guest-id="...">`.

- [ ] **Step 1: Add layout + guest-card CSS**

Append to `admin/styles.css`:

```css
.tables-layout{display:flex;gap:16px;align-items:flex-start}
.tables-guest-list{width:220px;flex-shrink:0;background:#fff;border:1px solid #e5e0d8;border-radius:8px;padding:10px;max-height:600px;overflow-y:auto}
.tables-filter{display:flex;gap:4px;margin-bottom:10px;flex-wrap:wrap}
.tables-filter button{font-size:11px;padding:4px 8px;border:1px solid #e5e0d8;background:#fff;border-radius:999px;cursor:pointer;color:var(--muted)}
.tables-filter button.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.guest-card{background:var(--accent-light);border-radius:6px;padding:6px 8px;margin-bottom:6px;font-size:12px;cursor:grab;display:flex;justify-content:space-between;align-items:center;gap:6px}
.guest-card .guest-card-count{color:var(--muted);font-size:10px;flex-shrink:0}
```

- [ ] **Step 2: Import `loadGuests` and add status-badge maps**

In `admin/tables.js`, update the top imports:

```js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadGuests } from './guests.js?v=4';
import { canWrite } from './permissions.js';
```

Add near the top (after `const tablesCol = ...`):

```js
const STATUS_LABELS = { confirmed: 'Confirmé', declined: 'Décliné', pending: 'En attente' };
const STATUS_BADGE = { confirmed: 'badge-confirmed', declined: 'badge-declined', pending: 'badge-pending' };
```

- [ ] **Step 3: Render the guest list and wire the filter**

Add this function above `renderTablesTab`:

```js
function renderGuestCard(guest) {
  const status = guest.rsvp?.status || 'pending';
  return `
    <div class="guest-card" draggable="true" data-guest-id="${escapeHtml(guest.id)}">
      <span>${escapeHtml(guest.name)} <span class="badge ${STATUS_BADGE[status]}" style="font-size:9px">${STATUS_LABELS[status]}</span></span>
      <span class="guest-card-count">${guestPartySize(guest)}p</span>
    </div>`;
}

function renderGuestList(guests, placedIds, statusFilter) {
  const unplaced = guests.filter(g => !placedIds.has(g.id) && (statusFilter === 'all' || (g.rsvp?.status || 'pending') === statusFilter));
  const filters = [
    { key: 'all', label: 'Tous' },
    { key: 'confirmed', label: 'Confirmés' },
    { key: 'pending', label: 'En attente' },
    { key: 'declined', label: 'Refusés' },
  ];
  return `
    <div class="tables-guest-list" id="tables-guest-list">
      <div class="tables-filter">
        ${filters.map(f => `<button type="button" class="guest-filter-btn${statusFilter === f.key ? ' active' : ''}" data-filter="${f.key}">${f.label}</button>`).join('')}
      </div>
      ${unplaced.length
        ? unplaced.map(renderGuestCard).join('')
        : '<p style="color:var(--muted);font-size:12px">Aucun invité non placé.</p>'}
    </div>`;
}
```

- [ ] **Step 4: Wire it into `renderTablesTab`**

Replace the entire `export async function renderTablesTab() { ... }` function from Task 2 with:

```js
export async function renderTablesTab(statusFilter = 'all') {
  const panel = document.getElementById('tab-tables');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('tables');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-table-btn" class="btn-primary">+ Ajouter une table</button>'
    : '';

  let tables, guests;
  try {
    [tables, guests] = await Promise.all([loadTables(), loadGuests()]);
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }

  const guestById = Object.fromEntries(guests.map(g => [g.id, g]));
  const validGuestIds = new Set(guests.map(g => g.id));
  tables = tables.map(t => ({ ...t, guestIds: t.guestIds.filter(id => validGuestIds.has(id)) }));
  const placedIds = new Set(tables.flatMap(t => t.guestIds));

  panel.innerHTML = `
    <div class="tables-layout">
      ${renderGuestList(guests, placedIds, statusFilter)}
      <div class="tables-canvas" id="tables-canvas">${tables.map(t => renderTableCircle(t, guestById)).join('')}</div>
    </div>`;

  panel.querySelectorAll('.guest-filter-btn').forEach(btn =>
    btn.addEventListener('click', () => renderTablesTab(btn.dataset.filter))
  );

  if (editable) {
    document.getElementById('add-table-btn').addEventListener('click', () =>
      openAddTablePanel(() => renderTablesTab(statusFilter))
    );
  }
}
```

- [ ] **Step 5: Syntax-check**

Run: `node --check admin/tables.js`
Expected: no output (exit code 0)

- [ ] **Step 6: Manual verification**

Reload `http://localhost:8090/admin/tables/`.
Expected: left column lists all guests not yet on a table, each with a status badge and party-size chip; filter pills (Tous/Confirmés/En attente/Refusés) narrow the list; right column still shows the table circles from Task 2.

- [ ] **Step 7: Commit**

```bash
git add admin/tables.js admin/styles.css
git commit -m "feat: add guest list panel with RSVP status filter"
```

---

### Task 4: Drag a guest onto a table (assignment)

**Files:**
- Modify: `admin/tables.js`

**Interfaces:**
- Consumes: `assignGuestToTable(tables, guestId, targetTableId)` (Task 1).
- Produces: guest cards start a native drag with `dataTransfer.setData('text/guest-id', guestId)`; table circles accept the drop and re-render.

- [ ] **Step 1: Add drag handlers for guest cards and table drop targets**

In `admin/tables.js`, add this function above `renderTablesTab`:

```js
function wireDragAndDrop(panel, tables, statusFilter) {
  panel.querySelectorAll('.guest-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/guest-id', card.dataset.guestId);
      e.dataTransfer.effectAllowed = 'move';
    });
  });

  panel.querySelectorAll('.table-circle').forEach(circle => {
    circle.addEventListener('dragover', e => {
      if (e.dataTransfer.types.includes('text/guest-id')) e.preventDefault();
    });
    circle.addEventListener('drop', async e => {
      const guestId = e.dataTransfer.getData('text/guest-id');
      if (!guestId) return;
      e.preventDefault();
      e.stopPropagation();
      await assignGuestToTable(tables, guestId, circle.dataset.id);
      renderTablesTab(statusFilter);
    });
  });
}
```

- [ ] **Step 2: Call it at the end of `renderTablesTab`**

Add this line right before the closing `}` of `renderTablesTab` (after the `if (editable) { ... }` block):

```js
  wireDragAndDrop(panel, tables, statusFilter);
```

- [ ] **Step 3: Syntax-check**

Run: `node --check admin/tables.js`
Expected: no output (exit code 0)

- [ ] **Step 4: Manual verification**

Reload `http://localhost:8090/admin/tables/`. Drag a guest card from the left list onto a table circle.
Expected: the guest disappears from the unplaced list, the table's count increments (e.g. `1/8`), and reloading the page keeps the assignment. Drag enough guests onto a small-capacity table to exceed it — the circle should turn red with a "⚠" and the count in red (from the `.over-capacity` CSS added in Task 2), and the drop must still succeed (not blocked).

- [ ] **Step 5: Commit**

```bash
git add admin/tables.js
git commit -m "feat: drag guests onto tables to assign seating"
```

---

### Task 5: Drag a table to reposition it

**Files:**
- Modify: `admin/tables.js`

**Interfaces:**
- Consumes: `updateTablePosition(tableId, x, y)` (Task 1).
- Produces: table circles start a native drag with `dataTransfer.setData('text/table-id', ...)`; the canvas container accepts the drop and computes the new `(x, y)` from the drop coordinates.

- [ ] **Step 1: Make table circles draggable for repositioning and the canvas a drop target**

In `wireDragAndDrop`, replace the `panel.querySelectorAll('.table-circle').forEach(circle => { ... });` block with:

```js
  let dragOffset = { x: 0, y: 0 };

  panel.querySelectorAll('.table-circle').forEach(circle => {
    circle.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/table-id', circle.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      const rect = circle.getBoundingClientRect();
      dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    });
    circle.addEventListener('dragover', e => {
      if (e.dataTransfer.types.includes('text/guest-id')) e.preventDefault();
    });
    circle.addEventListener('drop', async e => {
      const guestId = e.dataTransfer.getData('text/guest-id');
      if (!guestId) return;
      e.preventDefault();
      e.stopPropagation();
      await assignGuestToTable(tables, guestId, circle.dataset.id);
      renderTablesTab(statusFilter);
    });
  });

  const canvas = document.getElementById('tables-canvas');
  canvas.addEventListener('dragover', e => {
    if (e.dataTransfer.types.includes('text/table-id')) e.preventDefault();
  });
  canvas.addEventListener('drop', async e => {
    const tableId = e.dataTransfer.getData('text/table-id');
    if (!tableId) return;
    e.preventDefault();
    const canvasRect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.round(e.clientX - canvasRect.left - dragOffset.x));
    const y = Math.max(0, Math.round(e.clientY - canvasRect.top - dragOffset.y));
    await updateTablePosition(tableId, x, y);
    renderTablesTab(statusFilter);
  });
```

- [ ] **Step 2: Syntax-check**

Run: `node --check admin/tables.js`
Expected: no output (exit code 0)

- [ ] **Step 3: Manual verification**

Reload `http://localhost:8090/admin/tables/`. Drag a table circle to a new spot on the canvas (drop it away from another table).
Expected: the circle stays at the new position after drop, and after a full page reload it's still there. Dragging a guest onto a table still works (assignment from Task 4 unaffected).

- [ ] **Step 4: Commit**

```bash
git add admin/tables.js
git commit -m "feat: drag tables to reposition them on the canvas"
```

---

### Task 6: Table detail panel — view occupants, remove a guest, delete a table

**Files:**
- Modify: `admin/tables.js`
- Modify: `admin/styles.css`

**Interfaces:**
- Consumes: `removeGuestFromTable(tableId, guestId, guestIds)`, `deleteTable(tableId)` (Task 1).
- Produces: clicking a table circle (a plain click, not a drag) opens a panel listing its occupants with per-guest "Retirer" buttons and a "Supprimer la table" button.

- [ ] **Step 1: Add occupant-row CSS**

Append to `admin/styles.css`:

```css
.table-occupant-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0ece4;font-size:13px}
.table-occupant-row:last-child{border-bottom:none}
```

- [ ] **Step 2: Add the detail panel function**

Add above `renderTablesTab`:

```js
function openTableDetailPanel(table, guestById, onChange) {
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  function occupantRows() {
    if (!table.guestIds.length) return '<p style="color:var(--muted);font-size:13px">Aucun invité sur cette table.</p>';
    return table.guestIds.map(id => {
      const g = guestById[id];
      if (!g) return '';
      return `
        <div class="table-occupant-row" data-guest-id="${escapeHtml(id)}">
          <span>${escapeHtml(g.name)} (${guestPartySize(g)}p)</span>
          <button class="btn-secondary btn-remove-occupant" data-guest-id="${escapeHtml(id)}">Retirer</button>
        </div>`;
    }).join('');
  }

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${escapeHtml(table.name)}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body" id="occupant-list">${occupantRows()}</div>
    <div class="panel-footer">
      <button class="btn-danger" id="panel-delete-table">Supprimer la table</button>
      <button class="btn-secondary" id="panel-cancel">Fermer</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  panelEl.querySelectorAll('.btn-remove-occupant').forEach(btn => {
    btn.addEventListener('click', async () => {
      await removeGuestFromTable(table.id, btn.dataset.guestId, table.guestIds);
      close();
      onChange();
    });
  });

  panelEl.querySelector('#panel-delete-table').addEventListener('click', async () => {
    if (!confirm('Supprimer cette table ? Les invités qu\'elle contient redeviendront non placés.')) return;
    await deleteTable(table.id);
    close();
    onChange();
  });
}
```

- [ ] **Step 3: Wire click-to-open on table circles (without triggering on drag)**

In `wireDragAndDrop`, inside the `panel.querySelectorAll('.table-circle').forEach(circle => { ... })` loop, add a `click` listener alongside the existing `dragstart`/`dragover`/`drop` ones:

```js
    circle.addEventListener('click', () => {
      const table = tables.find(t => t.id === circle.dataset.id);
      if (table) openTableDetailPanel(table, guestByIdRef, () => renderTablesTab(statusFilter));
    });
```

`wireDragAndDrop` needs access to `guestById` to pass it through. Update its signature and the call site:

```js
function wireDragAndDrop(panel, tables, statusFilter, guestByIdRef) {
```

And in `renderTablesTab`, update the call:

```js
  wireDragAndDrop(panel, tables, statusFilter, guestById);
```

- [ ] **Step 4: Syntax-check**

Run: `node --check admin/tables.js`
Expected: no output (exit code 0)

- [ ] **Step 5: Manual verification**

Reload `http://localhost:8090/admin/tables/`. Click (not drag) a table with guests on it.
Expected: a panel opens listing each occupant with a "Retirer" button — clicking it removes that guest from the table and closes the panel, guest reappears in the unplaced list. Click "Supprimer la table" on a table with guests, confirm the browser confirm dialog — the table disappears from the canvas and its former occupants are back in the unplaced list.

- [ ] **Step 6: Commit**

```bash
git add admin/tables.js admin/styles.css
git commit -m "feat: add table detail panel to remove guests and delete tables"
```
