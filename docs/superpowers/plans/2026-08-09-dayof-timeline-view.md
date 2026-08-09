# Vue frise drag & drop — Déroulé jour-J — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a drag & drop calendar-style timeline view (lanes: Général / Mariée / Marié / Témoins...) to the existing "Déroulé jour-J" admin tab, alongside the current table view.

**Architecture:** Two new focused modules (`admin/timeline-lanes.js` for lane CRUD + management panel, `admin/dayof-timeline.js` for the frise rendering and drag/resize interaction) plug into the existing `admin/dayof.js` orchestrator, which gains a Tableau/Frise toggle and two new `runOfShow` fields (`endTime`, `laneId`). No build step, no test framework in this repo — verification is manual in the browser via the `wedding` preview server, consistent with the existing `dayof.js` (see `docs/superpowers/specs/2026-08-08-day-of-timeline-design.md`).

**Tech Stack:** Vanilla JS ES modules, Firebase Firestore v10.7.1 (CDN imports), no bundler. Static site served via `docker-compose` (nginx) on the port assigned by the `wedding` launch config.

## Global Constraints

- No new dependencies, no build step — plain ES modules matching every existing `admin/*.js` file.
- Cache-busting convention: every changed module's import gets its `?v=N` query bumped by 1 in the importing file (see `admin/script.js`).
- French UI strings only, matching the rest of the admin (per spec: "usage interne uniquement, une seule langue").
- Permissions: all writes gated by `canWrite('dayof')` from `admin/permissions.js`; reads gated by the tab already being visible (`canRead('dayof')` in `admin/script.js`'s nav).
- Snap granularity: 15 minutes, on both drag and resize (per approved spec).
- Grid covers 06:00–24:00 fixed (no zoom/reconfigurable range — out of scope per spec).

---

### Task 1: Firestore rules + lane data module

**Files:**
- Modify: `firestore.rules:41-44` (add a new `match` block after the existing `runOfShow` block)
- Create: `admin/timeline-lanes.js`

**Interfaces:**
- Produces: `GENERAL_LANE_ID` (string constant `'__general__'`), `loadLanes(): Promise<Array<{id, label, order, color}>>` (always includes the synthetic Général lane first, `order: -1`), `addLane(label: string, color: string): Promise<void>`, `renameLane(id: string, label: string, color: string): Promise<void>`, `reorderLane(lanes: Array, id: string, direction: 1|-1): Promise<void>`, `deleteLane(id: string): Promise<void>` (reassigns affected `runOfShow` items to `laneId: null` in a batch before deleting the lane doc).

- [ ] **Step 1: Add Firestore rules for `timelineLanes`**

Edit `firestore.rules`, insert right after the `runOfShow` match block (currently lines 41-44):

```
    match /runOfShow/{itemId} {
      allow read: if perm('dayof') in ['read', 'write'];
      allow write: if perm('dayof') == 'write';
    }

    match /timelineLanes/{laneId} {
      allow read: if perm('dayof') in ['read', 'write'];
      allow write: if perm('dayof') == 'write';
    }
```

- [ ] **Step 2: Create `admin/timeline-lanes.js` with the data functions**

```js
// admin/timeline-lanes.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, writeBatch,
  query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const lanesCol = collection(db, 'timelineLanes');
const runOfShowCol = collection(db, 'runOfShow');

export const GENERAL_LANE_ID = '__general__';
const GENERAL_LANE = { id: GENERAL_LANE_ID, label: 'Général', order: -1, color: '#9ca3af' };

export async function loadLanes() {
  const snap = await getDocs(query(lanesCol, orderBy('order')));
  return [GENERAL_LANE, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))];
}

export async function addLane(label, color) {
  const snap = await getDocs(lanesCol);
  const maxOrder = snap.docs.reduce((max, d) => Math.max(max, d.data().order ?? 0), 0);
  await addDoc(lanesCol, { label, color, order: maxOrder + 1 });
}

export async function renameLane(id, label, color) {
  await updateDoc(doc(db, 'timelineLanes', id), { label, color });
}

export async function reorderLane(lanes, id, direction) {
  const movable = lanes.filter(l => l.id !== GENERAL_LANE_ID);
  const idx = movable.findIndex(l => l.id === id);
  const targetIdx = idx + direction;
  if (idx === -1 || targetIdx < 0 || targetIdx >= movable.length) return;
  const a = movable[idx];
  const b = movable[targetIdx];
  await updateDoc(doc(db, 'timelineLanes', a.id), { order: b.order });
  await updateDoc(doc(db, 'timelineLanes', b.id), { order: a.order });
}

export async function deleteLane(id) {
  const itemsSnap = await getDocs(runOfShowCol);
  const batch = writeBatch(db);
  itemsSnap.docs.forEach(d => {
    if (d.data().laneId === id) batch.update(d.ref, { laneId: null });
  });
  batch.delete(doc(db, 'timelineLanes', id));
  await batch.commit();
}
```

- [ ] **Step 3: Manual verification**

Rules changes only take effect after `firebase deploy --only firestore:rules`. Note this for the user — do not run it automatically (deploys are a user action). For now, verify the module has no syntax errors: open the `wedding` preview, open the browser console, and run:

```js
import('/admin/timeline-lanes.js').then(m => console.log(Object.keys(m)))
```

Expected: logs `["GENERAL_LANE_ID", "loadLanes", "addLane", "renameLane", "reorderLane", "deleteLane"]`, no errors.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules admin/timeline-lanes.js
git commit -m "feat: add timelineLanes Firestore rules and CRUD module"
```

---

### Task 2: Lane management panel UI

**Files:**
- Modify: `admin/timeline-lanes.js` (append UI function)
- Modify: `admin/styles.css` (append lane-row styles)

**Interfaces:**
- Consumes: `GENERAL_LANE_ID`, `loadLanes`, `addLane`, `renameLane`, `reorderLane`, `deleteLane` (from Task 1, same file).
- Produces: `openLaneManagerPanel(lanes: Array, onChange: () => void): void` — opens a slide-in panel (reuses existing `.panel`/`.panel-overlay` CSS), calls `onChange()` after any successful mutation so the caller can re-render.

- [ ] **Step 1: Append the panel UI to `admin/timeline-lanes.js`**

```js
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function openLaneManagerPanel(lanes, onChange) {
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  function rowsHtml(currentLanes) {
    const movable = currentLanes.filter(l => l.id !== GENERAL_LANE_ID);
    return currentLanes.map(lane => {
      const isGeneral = lane.id === GENERAL_LANE_ID;
      const mIdx = movable.findIndex(l => l.id === lane.id);
      return `
        <div class="lane-row" data-id="${lane.id}">
          <input type="color" class="lane-color" value="${lane.color}" ${isGeneral ? 'disabled' : ''}>
          <input type="text" class="lane-label" value="${escapeHtml(lane.label)}" ${isGeneral ? 'disabled' : ''}>
          <button class="btn-icon lane-up" title="Monter" ${isGeneral || mIdx <= 0 ? 'disabled' : ''}>↑</button>
          <button class="btn-icon lane-down" title="Descendre" ${isGeneral || mIdx >= movable.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn-danger lane-delete" ${isGeneral ? 'disabled' : ''}>Supprimer</button>
        </div>`;
    }).join('');
  }

  function render(currentLanes) {
    panelEl.innerHTML = `
      <div class="panel-header">
        <h3>Gérer les lanes</h3>
        <button class="btn-icon" id="panel-close">✕</button>
      </div>
      <div class="panel-body">
        <div class="lane-list">${rowsHtml(currentLanes)}</div>
        <div class="lane-add-row">
          <input type="color" id="new-lane-color" value="#6E1A1A">
          <input type="text" id="new-lane-label" placeholder="Nom de la lane">
          <button class="btn-primary" id="add-lane-btn">Ajouter</button>
        </div>
      </div>
      <div class="panel-footer">
        <button class="btn-secondary" id="panel-cancel">Fermer</button>
      </div>`;

    panelEl.querySelector('#panel-close').addEventListener('click', close);
    panelEl.querySelector('#panel-cancel').addEventListener('click', close);

    panelEl.querySelector('#add-lane-btn').addEventListener('click', async () => {
      const label = panelEl.querySelector('#new-lane-label').value.trim();
      if (!label) return;
      const color = panelEl.querySelector('#new-lane-color').value;
      await addLane(label, color);
      onChange();
      const fresh = await loadLanes();
      render(fresh);
    });

    panelEl.querySelectorAll('.lane-row').forEach(row => {
      const id = row.dataset.id;
      if (id === GENERAL_LANE_ID) return;
      const labelInput = row.querySelector('.lane-label');
      const colorInput = row.querySelector('.lane-color');
      const commit = async () => {
        await renameLane(id, labelInput.value.trim() || 'Sans nom', colorInput.value);
        onChange();
      };
      labelInput.addEventListener('change', commit);
      colorInput.addEventListener('change', commit);

      row.querySelector('.lane-up').addEventListener('click', async () => {
        await reorderLane(currentLanes, id, -1);
        onChange();
        render(await loadLanes());
      });
      row.querySelector('.lane-down').addEventListener('click', async () => {
        await reorderLane(currentLanes, id, 1);
        onChange();
        render(await loadLanes());
      });
      row.querySelector('.lane-delete').addEventListener('click', async () => {
        if (!confirm('Supprimer cette lane ? Les lignes qui y sont rattachées repasseront sur "Général".')) return;
        await deleteLane(id);
        onChange();
        render(await loadLanes());
      });
    });
  }

  function close() { overlay.remove(); panelEl.remove(); }
  overlay.addEventListener('click', close);

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);
  render(lanes);
}
```

- [ ] **Step 2: Append lane-row styles to `admin/styles.css`**

```css
/* ── Lane manager ── */
.lane-list{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
.lane-row{display:flex;align-items:center;gap:8px}
.lane-row .lane-label{flex:1;padding:6px 9px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit}
.lane-row .lane-color{width:28px;height:28px;padding:0;border:1px solid var(--border);border-radius:6px;cursor:pointer}
.lane-add-row{display:flex;align-items:center;gap:8px;padding-top:12px;border-top:1px solid var(--border)}
.lane-add-row #new-lane-label{flex:1;padding:6px 9px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit}
.lane-add-row .lane-color,.lane-add-row #new-lane-color{width:28px;height:28px;padding:0;border:1px solid var(--border);border-radius:6px;cursor:pointer}
```

- [ ] **Step 3: Manual verification**

This panel isn't wired to any button yet (that happens in Task 8) — verify it renders standalone by temporarily calling it from the browser console on the admin page (logged in, `dayof` tab open):

```js
const m = await import('/admin/timeline-lanes.js');
const lanes = await m.loadLanes();
m.openLaneManagerPanel(lanes, () => console.log('changed'));
```

Expected: slide-in panel appears with "Général" row (disabled inputs, no delete) plus an add-row. Add a lane, confirm it appears; delete it, confirm it's removed. Close via ✕ or overlay click.

- [ ] **Step 4: Commit**

```bash
git add admin/timeline-lanes.js admin/styles.css
git commit -m "feat: add lane management panel UI"
```

---

### Task 3: Extend runOfShow schema — table columns + edit panel fields

**Files:**
- Modify: `admin/dayof.js:8` (import lanes loader), `admin/dayof.js:34-73` (`renderDayOfTab` — load lanes, add table columns), `admin/dayof.js:112-212` (`openDayOfPanel` — add endTime + lane fields)

**Interfaces:**
- Consumes: `loadLanes`, `GENERAL_LANE_ID` from `admin/timeline-lanes.js` (Task 1).
- Produces: `runOfShow` docs now carry `endTime: string|null` and `laneId: string|null`, read by Tasks 4-8.

- [ ] **Step 1: Import the lanes loader**

In `admin/dayof.js`, change line 8:

```js
import { loadVendors } from './vendors.js?v=7';
```

to:

```js
import { loadVendors } from './vendors.js?v=7';
import { loadLanes, GENERAL_LANE_ID } from './timeline-lanes.js?v=1';
```

- [ ] **Step 2: Load lanes and add a lane lookup + label helper in `renderDayOfTab`**

Replace lines 34-44:

```js
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
```

with:

```js
  const [items, guests, vendors, lanes] = await Promise.all([
    loadRunOfShow(), loadGuests(), loadVendors(), loadLanes()
  ]);
  const guestsById = new Map(guests.map(g => [g.id, g]));
  const vendorsById = new Map(vendors.map(v => [v.id, v]));
  const lanesById = new Map(lanes.map(l => [l.id, l]));

  const responsibleLabel = (item) => {
    if (item.responsibleType === 'guest') return guestsById.get(item.responsibleId)?.name || '—';
    if (item.responsibleType === 'vendor') return vendorsById.get(item.responsibleId)?.name || '—';
    return '—';
  };
  const laneLabel = (item) => lanesById.get(item.laneId || GENERAL_LANE_ID)?.label || '—';
```

- [ ] **Step 3: Add table columns**

Replace the table header/body block (current lines 48-73):

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

with:

```js
  panel.innerHTML = `
    <button id="print-dayof-btn" class="btn-secondary no-print" style="margin-bottom:16px">Imprimer</button>
    <table class="admin-table">
      <thead>
        <tr>
          <th>Heure</th><th>Heure fin</th><th>Titre</th><th>Lieu</th><th>Lane</th><th>Responsable</th><th>Notes</th>
          <th class="no-print">Fait</th><th class="no-print">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items.length ? items.map(item => `
          <tr>
            <td>${escapeHtml(item.time)}</td>
            <td>${escapeHtml(item.endTime || '—')}</td>
            <td>${escapeHtml(item.title)}</td>
            <td>${escapeHtml(item.location || '—')}</td>
            <td>${escapeHtml(laneLabel(item))}</td>
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
          : '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:40px">Aucune ligne.</td></tr>'}
      </tbody>
    </table>`;
```

(Note the `colspan` bumped from 7 to 9 for the two new columns.)

- [ ] **Step 4: Pass `lanes` through to the edit panel calls**

`openDayOfPanel` calls (current lines 78-83) already forward `items, guests, vendors`; add `lanes`:

```js
  if (editable) {
    document.getElementById('add-dayof-btn').addEventListener('click', () =>
      openDayOfPanel(null, items, guests, vendors, lanes)
    );
    panel.querySelectorAll('.btn-edit-dayof').forEach(btn =>
      btn.addEventListener('click', () => openDayOfPanel(btn.dataset.id, items, guests, vendors, lanes))
    );
```

- [ ] **Step 5: Add `endTime` and lane fields to `openDayOfPanel`**

Change the function signature (current line 112):

```js
function openDayOfPanel(id, items, guests, vendors) {
```

to:

```js
function openDayOfPanel(id, items, guests, vendors, lanes) {
```

Add a lane `<select>` and `endTime` input to the form. Replace the "Heure" field line (current line 143):

```js
      <label class="field"><span>Heure</span><input id="dayof-time" type="time" value="${escapeHtml(v('time'))}" required></label>
```

with:

```js
      <label class="field"><span>Heure</span><input id="dayof-time" type="time" value="${escapeHtml(v('time'))}" required></label>
      <label class="field"><span>Heure fin</span><input id="dayof-end-time" type="time" value="${escapeHtml(v('endTime'))}"></label>
      <label class="field"><span>Lane</span>
        <select id="dayof-lane">
          ${lanes.map(l => `<option value="${escapeHtml(l.id)}" ${(v('laneId', GENERAL_LANE_ID) || GENERAL_LANE_ID) === l.id ? 'selected' : ''}>${escapeHtml(l.label)}</option>`).join('')}
        </select>
      </label>
```

- [ ] **Step 6: Save the new fields**

In the save handler (current lines 182-197), replace:

```js
    const data = {
      time,
      title,
      location: get('#dayof-location'),
      responsibleType: responsibleIdVal ? responsibleTypeVal : 'none',
      responsibleId: responsibleIdVal,
      notes: get('#dayof-notes'),
      done: panelEl.querySelector('#dayof-done').checked,
    };
```

with:

```js
    const endTimeVal = get('#dayof-end-time');
    const laneVal = get('#dayof-lane');
    const data = {
      time,
      endTime: endTimeVal || null,
      laneId: laneVal === GENERAL_LANE_ID ? null : laneVal,
      title,
      location: get('#dayof-location'),
      responsibleType: responsibleIdVal ? responsibleTypeVal : 'none',
      responsibleId: responsibleIdVal,
      notes: get('#dayof-notes'),
      done: panelEl.querySelector('#dayof-done').checked,
    };
```

- [ ] **Step 7: Manual verification**

Reload the `wedding` preview, open Déroulé jour-J. Create a line with a start + end time and a lane. Confirm: table shows both times and the lane label; edit an existing line, confirm the lane select defaults to "Général" when `laneId` is absent; delete works as before.

- [ ] **Step 8: Commit**

```bash
git add admin/dayof.js
git commit -m "feat: add endTime and lane fields to runOfShow schema"
```

---

### Task 4: View toggle + frise grid skeleton

**Files:**
- Modify: `admin/dayof.js` (add Tableau/Frise toggle, view state, container swap)
- Create: `admin/dayof-timeline.js` (grid skeleton only — hour axis + lane column headers, no blocks yet)
- Modify: `admin/styles.css` (grid layout styles)

**Interfaces:**
- Consumes: `lanes: Array<{id,label,order,color}>` (loaded in `dayof.js`, Task 3).
- Produces: `renderTimelineGrid(container: HTMLElement, lanes: Array, items: Array, onBlockClick: (id:string)=>void, editable: boolean): void` — the entry point Tasks 5-8 build on. Exports `DAY_START_MIN`, `DAY_END_MIN`, `PX_PER_MIN`, `timeToMinutes`, `minutesToTime` for reuse.

- [ ] **Step 1: Create `admin/dayof-timeline.js` with time helpers and the grid skeleton**

```js
// admin/dayof-timeline.js
export const DAY_START_MIN = 6 * 60;   // 06:00
export const DAY_END_MIN = 24 * 60;    // 24:00
export const PX_PER_MIN = 2;
export const SNAP_MIN = 15;
export const DEFAULT_DURATION_MIN = 30;

export function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(min) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hourMarkers() {
  const rows = [];
  for (let min = DAY_START_MIN; min < DAY_END_MIN; min += 60) {
    rows.push(`<div class="timeline-hour" style="top:${(min - DAY_START_MIN) * PX_PER_MIN}px">${minutesToTime(min)}</div>`);
  }
  return rows.join('');
}

export function renderTimelineGrid(container, lanes, items, onBlockClick, editable) {
  const gridHeight = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;
  container.innerHTML = `
    <div class="timeline-grid" style="grid-template-columns:60px repeat(${lanes.length}, 1fr)">
      <div class="timeline-axis-header"></div>
      ${lanes.map(l => `<div class="timeline-lane-header" style="border-top-color:${l.color}">${l.label ? l.label.replace(/</g, '&lt;') : ''}</div>`).join('')}
      <div class="timeline-axis" style="height:${gridHeight}px">${hourMarkers()}</div>
      ${lanes.map(l => `<div class="timeline-lane-col" data-lane-id="${l.id}" style="height:${gridHeight}px"></div>`).join('')}
    </div>`;
}
```

- [ ] **Step 2: Add the Tableau/Frise toggle and view state to `admin/dayof.js`**

Add the import (after the Task 3 import line):

```js
import { renderTimelineGrid } from './dayof-timeline.js?v=1';
```

Add module-level view state right after the `dayOfCol` declaration (current line 11):

```js
const dayOfCol = collection(db, 'runOfShow');
let currentView = 'table';
```

Replace the print button line in `renderDayOfTab` (current line 47, now shifted by Task 3's edits — locate `<button id="print-dayof-btn"`) so the toolbar includes the toggle, and add a container for the frise view. Replace:

```js
  panel.innerHTML = `
    <button id="print-dayof-btn" class="btn-secondary no-print" style="margin-bottom:16px">Imprimer</button>
    <table class="admin-table">
```

with:

```js
  panel.innerHTML = `
    <div class="no-print" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div class="btn-group" style="margin-bottom:0;width:auto">
        <button class="btn-group-item dayof-view-btn ${currentView === 'table' ? 'active' : ''}" data-view="table">Tableau</button>
        <button class="btn-group-item dayof-view-btn ${currentView === 'frise' ? 'active' : ''}" data-view="frise">Frise</button>
      </div>
      <button id="print-dayof-btn" class="btn-secondary">Imprimer</button>
    </div>
    <div id="dayof-table-view" ${currentView === 'frise' ? 'hidden' : ''}>
    <table class="admin-table">
```

...and close the new wrapper div after the `</table>` tag. Find the closing:

```js
      </tbody>
    </table>`;
```

and change to:

```js
      </tbody>
    </table>
    </div>
    <div id="dayof-timeline-view" ${currentView === 'table' ? 'hidden' : ''}></div>`;
```

- [ ] **Step 3: Wire the toggle and call `renderTimelineGrid` when active**

After the existing `document.getElementById('print-dayof-btn')...` listener (current line 75), add:

```js
  document.querySelectorAll('.dayof-view-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view;
      renderDayOfTab();
    })
  );

  if (currentView === 'frise') {
    renderTimelineGrid(document.getElementById('dayof-timeline-view'), lanes, items, () => {}, editable);
  }
```

- [ ] **Step 4: `.btn-group` on `#dayof-view-btn` needs a non-full-width variant**

The existing `.btn-group{...margin-bottom:14px}` (styles.css line 157) assumes a form context. Add an override so it sits inline in the toolbar — append to `admin/styles.css`:

```css
.dayof-view-btn.active{background:var(--accent);color:#fff}
```

- [ ] **Step 5: Add the grid layout CSS**

Append to `admin/styles.css`:

```css
/* ── Day-of timeline (frise) ── */
.timeline-grid{display:grid;position:relative;background:var(--admin-card);border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.04);overflow:hidden}
.timeline-axis-header,.timeline-lane-header{padding:8px 10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);background:#f9fafb;border-bottom:1px solid var(--border);border-top:3px solid transparent;text-align:center}
.timeline-axis{position:relative;border-right:1px solid var(--border)}
.timeline-hour{position:absolute;left:0;right:0;font-size:11px;color:var(--muted);padding:2px 6px;border-top:1px solid var(--border)}
.timeline-lane-col{position:relative;border-right:1px solid var(--border)}
.timeline-lane-col:last-child{border-right:none}
```

- [ ] **Step 6: Manual verification**

Reload the preview. Toggle to "Frise": expect an empty grid with hour markers (06:00 → 23:00) down the left and one column per lane (Général + any created in Task 2), lane headers colored by their top border. Toggle back to "Tableau": table view returns unchanged. No console errors.

- [ ] **Step 7: Commit**

```bash
git add admin/dayof.js admin/dayof-timeline.js admin/styles.css
git commit -m "feat: add Tableau/Frise toggle and empty timeline grid"
```

---

### Task 5: Render positioned blocks + mobile lane tabs

**Files:**
- Modify: `admin/dayof-timeline.js` (block rendering, mobile tabs)
- Modify: `admin/styles.css` (block + mobile tab styles)

**Interfaces:**
- Consumes: `DAY_START_MIN`, `DAY_END_MIN`, `PX_PER_MIN`, `SNAP_MIN`, `DEFAULT_DURATION_MIN`, `timeToMinutes`, `minutesToTime` (Task 4, same file).
- Produces: blocks rendered with `data-item-id` and `data-lane-id` attributes, ready for Tasks 6-8 to attach drag/resize/click listeners. Mobile viewport (<768px) shows one lane at a time via tabs, `.timeline-lane-col[hidden]` toggled by tab state.

- [ ] **Step 1: Add block rendering to `renderTimelineGrid`**

Replace the lane-column line in `renderTimelineGrid` (from Task 4):

```js
      ${lanes.map(l => `<div class="timeline-lane-col" data-lane-id="${l.id}" style="height:${gridHeight}px"></div>`).join('')}
```

with:

```js
      ${lanes.map(l => `<div class="timeline-lane-col" data-lane-id="${l.id}" style="height:${gridHeight}px">${blocksHtmlForLane(l, items)}</div>`).join('')}
```

Add `blocksHtmlForLane` above `renderTimelineGrid`:

```js
function blocksHtmlForLane(lane, items) {
  return items
    .filter(item => (item.laneId || lanes_GENERAL_SENTINEL) === lane.id)
    .map(item => {
      const startMin = timeToMinutes(item.time);
      const endMin = item.endTime ? timeToMinutes(item.endTime) : startMin + DEFAULT_DURATION_MIN;
      const durationMin = Math.max(SNAP_MIN, endMin - startMin);
      const top = (startMin - DAY_START_MIN) * PX_PER_MIN;
      const height = durationMin * PX_PER_MIN;
      return `
        <div class="timeline-block" data-item-id="${item.id}" style="top:${top}px;height:${height}px;background:${lane.color}33;border-left-color:${lane.color}">
          <div class="timeline-block-title">${escapeHtmlLocal(item.title)}</div>
          <div class="timeline-block-time">${escapeHtmlLocal(item.time)}–${escapeHtmlLocal(minutesToTime(endMin))}</div>
          <div class="timeline-resize-handle"></div>
        </div>`;
    }).join('');
}

function escapeHtmlLocal(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

`lanes_GENERAL_SENTINEL` must resolve to the same Général id used elsewhere — import it instead of inventing a new constant. Update the top of `admin/dayof-timeline.js`:

```js
import { GENERAL_LANE_ID } from './timeline-lanes.js?v=1';
```

and use `GENERAL_LANE_ID` in place of `lanes_GENERAL_SENTINEL`:

```js
    .filter(item => (item.laneId || GENERAL_LANE_ID) === lane.id)
```

- [ ] **Step 2: Add block + resize-handle CSS**

Append to `admin/styles.css`:

```css
.timeline-block{position:absolute;left:2px;right:2px;border-left:4px solid;border-radius:4px;padding:4px 6px;overflow:hidden;cursor:grab;background-clip:padding-box;user-select:none}
.timeline-block:active{cursor:grabbing}
.timeline-block-title{font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.timeline-block-time{font-size:11px;color:var(--muted)}
.timeline-resize-handle{position:absolute;left:0;right:0;bottom:0;height:6px;cursor:ns-resize}
```

- [ ] **Step 3: Add mobile lane tabs**

Modify `renderTimelineGrid` to render tabs above the grid on narrow viewports (CSS-driven visibility, always rendered in the DOM):

```js
export function renderTimelineGrid(container, lanes, items, onBlockClick, editable) {
  const gridHeight = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;
  let activeLaneId = lanes[0]?.id;

  container.innerHTML = `
    <div class="timeline-mobile-tabs">
      ${lanes.map(l => `<button class="timeline-tab ${l.id === activeLaneId ? 'active' : ''}" data-lane-id="${l.id}">${escapeHtmlLocal(l.label)}</button>`).join('')}
    </div>
    <div class="timeline-grid" style="grid-template-columns:60px repeat(${lanes.length}, 1fr)">
      <div class="timeline-axis-header"></div>
      ${lanes.map(l => `<div class="timeline-lane-header" data-lane-id="${l.id}" style="border-top-color:${l.color}">${escapeHtmlLocal(l.label)}</div>`).join('')}
      <div class="timeline-axis" style="height:${gridHeight}px">${hourMarkers()}</div>
      ${lanes.map(l => `<div class="timeline-lane-col" data-lane-id="${l.id}" style="height:${gridHeight}px">${blocksHtmlForLane(l, items)}</div>`).join('')}
    </div>`;

  function applyMobileFilter() {
    container.querySelectorAll('.timeline-lane-header, .timeline-lane-col').forEach(el => {
      el.classList.toggle('timeline-mobile-hidden', el.dataset.laneId !== activeLaneId);
    });
    container.querySelectorAll('.timeline-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.laneId === activeLaneId);
    });
  }

  container.querySelectorAll('.timeline-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeLaneId = tab.dataset.laneId;
      applyMobileFilter();
    });
  });

  applyMobileFilter();
}
```

- [ ] **Step 4: Add mobile tab + responsive CSS**

Append to `admin/styles.css`:

```css
.timeline-mobile-tabs{display:none;gap:6px;overflow-x:auto;margin-bottom:10px}
.timeline-tab{flex-shrink:0;padding:6px 12px;border:1px solid var(--border);border-radius:999px;background:var(--admin-card);font-size:12px;color:var(--muted)}
.timeline-tab.active{background:var(--accent);color:#fff;border-color:var(--accent)}

@media (max-width: 768px) {
  .timeline-mobile-tabs{display:flex}
  .timeline-grid{grid-template-columns:60px 1fr !important}
  .timeline-lane-header.timeline-mobile-hidden,.timeline-lane-col.timeline-mobile-hidden{display:none}
}
```

- [ ] **Step 5: Manual verification**

Reload preview, add 2-3 `runOfShow` items with different lanes/times via the table view, switch to Frise: expect colored blocks positioned/sized proportionally to their time range, titles truncated if too long. Resize browser window to <768px width: expect tabs to appear, only one lane's column visible at a time, tapping tabs switches which lane is shown.

- [ ] **Step 6: Commit**

```bash
git add admin/dayof-timeline.js admin/styles.css
git commit -m "feat: render positioned timeline blocks with mobile lane tabs"
```

---

### Task 6: Drag to move a block

**Files:**
- Modify: `admin/dayof-timeline.js`

**Interfaces:**
- Consumes: block DOM elements (`data-item-id`) rendered in Task 5, `items` array (for looking up current `time`/`endTime` by id), `timeToMinutes`/`minutesToTime`/`SNAP_MIN`/`DAY_START_MIN`/`DAY_END_MIN`/`PX_PER_MIN`.
- Produces: `renderTimelineGrid` gains an `onItemMoved: (id: string, newTime: string, newEndTime: string) => void` callback parameter, invoked once per completed drag (not per frame) so the caller can `updateDoc` and re-render.

- [ ] **Step 1: Change the `renderTimelineGrid` signature to accept `onItemMoved`**

```js
export function renderTimelineGrid(container, lanes, items, { onBlockClick, onItemMoved, editable }) {
```

This replaces the previous positional `onBlockClick, editable` params — update the Task 4/5 call site in `admin/dayof.js`:

```js
  if (currentView === 'frise') {
    renderTimelineGrid(document.getElementById('dayof-timeline-view'), lanes, items, {
      onBlockClick: () => {},
      onItemMoved: async (id, newTime, newEndTime) => {
        await updateDoc(doc(db, 'runOfShow', id), { time: newTime, endTime: newEndTime });
        renderDayOfTab();
      },
      editable,
    });
  }
```

- [ ] **Step 2: Attach drag listeners after rendering blocks**

Add at the end of `renderTimelineGrid`, after `applyMobileFilter()`:

```js
  if (editable) {
    container.querySelectorAll('.timeline-block').forEach(block => {
      attachDragHandlers(block, items, onItemMoved);
    });
  }
```

- [ ] **Step 3: Implement `attachDragHandlers` for move**

Add this function to `admin/dayof-timeline.js`:

```js
function attachDragHandlers(block, items, onItemMoved) {
  const itemId = block.dataset.itemId;

  block.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('timeline-resize-handle')) return; // handled by Task 7
    e.preventDefault();
    const item = items.find(i => i.id === itemId);
    const startY = e.clientY;
    const startMin = timeToMinutes(item.time);
    const endMin = item.endTime ? timeToMinutes(item.endTime) : startMin + DEFAULT_DURATION_MIN;
    const durationMin = endMin - startMin;
    let moved = false;
    let finalStartMin = startMin;

    function onMouseMove(ev) {
      const deltaPx = ev.clientY - startY;
      if (Math.abs(deltaPx) > 3) moved = true;
      const deltaMinRaw = deltaPx / PX_PER_MIN;
      const snappedDelta = Math.round(deltaMinRaw / SNAP_MIN) * SNAP_MIN;
      let newStart = startMin + snappedDelta;
      newStart = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - durationMin, newStart));
      finalStartMin = newStart;
      block.style.top = `${(newStart - DAY_START_MIN) * PX_PER_MIN}px`;
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (moved && finalStartMin !== startMin) {
        onItemMoved(itemId, minutesToTime(finalStartMin), minutesToTime(finalStartMin + durationMin));
      } else if (!moved) {
        block.dataset.wasClick = 'true';
      }
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}
```

(`block.dataset.wasClick` is consumed by Task 8's click handler.)

- [ ] **Step 4: Manual verification**

Reload preview, switch to Frise. Drag a block up/down: expect it to move live, snapping visibly in 15-minute increments, and to stop at the grid's top/bottom edges. Release: expect the block to settle at the new time and the table view (switch back to Tableau) to reflect the updated `time`/`endTime`. Confirm dragging is a no-op with `dayof` set to read-only (log in as a read-only account, or temporarily check `editable` is `false` — no drag listeners attached, cursor stays default).

- [ ] **Step 5: Commit**

```bash
git add admin/dayof.js admin/dayof-timeline.js
git commit -m "feat: drag timeline blocks to change their time"
```

---

### Task 7: Resize handle to change `endTime`

**Files:**
- Modify: `admin/dayof-timeline.js`

**Interfaces:**
- Consumes: same as Task 6.
- Produces: extends `onItemMoved`'s contract — resize also calls `onItemMoved(id, item.time, newEndTime)` (start time unchanged), so `admin/dayof.js`'s handler from Task 6 needs no change.

- [ ] **Step 1: Attach resize listener alongside the drag listener**

Modify `attachDragHandlers` (Task 6) to also wire the handle. Full function after this change:

```js
function attachDragHandlers(block, items, onItemMoved) {
  const itemId = block.dataset.itemId;

  block.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('timeline-resize-handle')) return;
    e.preventDefault();
    const item = items.find(i => i.id === itemId);
    const startY = e.clientY;
    const startMin = timeToMinutes(item.time);
    const endMin = item.endTime ? timeToMinutes(item.endTime) : startMin + DEFAULT_DURATION_MIN;
    const durationMin = endMin - startMin;
    let moved = false;
    let finalStartMin = startMin;

    function onMouseMove(ev) {
      const deltaPx = ev.clientY - startY;
      if (Math.abs(deltaPx) > 3) moved = true;
      const deltaMinRaw = deltaPx / PX_PER_MIN;
      const snappedDelta = Math.round(deltaMinRaw / SNAP_MIN) * SNAP_MIN;
      let newStart = startMin + snappedDelta;
      newStart = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - durationMin, newStart));
      finalStartMin = newStart;
      block.style.top = `${(newStart - DAY_START_MIN) * PX_PER_MIN}px`;
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (moved && finalStartMin !== startMin) {
        onItemMoved(itemId, minutesToTime(finalStartMin), minutesToTime(finalStartMin + durationMin));
      }
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  const handle = block.querySelector('.timeline-resize-handle');
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const item = items.find(i => i.id === itemId);
    const startY = e.clientY;
    const startMin = timeToMinutes(item.time);
    const initialEndMin = item.endTime ? timeToMinutes(item.endTime) : startMin + DEFAULT_DURATION_MIN;
    let finalEndMin = initialEndMin;

    function onMouseMove(ev) {
      const deltaPx = ev.clientY - startY;
      const deltaMinRaw = deltaPx / PX_PER_MIN;
      const snappedDelta = Math.round(deltaMinRaw / SNAP_MIN) * SNAP_MIN;
      let newEnd = initialEndMin + snappedDelta;
      newEnd = Math.max(startMin + SNAP_MIN, Math.min(DAY_END_MIN, newEnd));
      finalEndMin = newEnd;
      block.style.height = `${(newEnd - startMin) * PX_PER_MIN}px`;
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (finalEndMin !== initialEndMin) {
        onItemMoved(itemId, minutesToTime(startMin), minutesToTime(finalEndMin));
      }
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}
```

- [ ] **Step 2: Manual verification**

Reload preview, switch to Frise. Drag a block's bottom edge down: expect the block to grow, snapped to 15-minute increments, `endTime` updated in the table view after release. Drag it up past the 15-minute minimum: expect it to clamp (block never shrinks below one 15-minute slot). Drag past the bottom of the grid (past 24:00): expect it to clamp at the grid's bottom edge.

- [ ] **Step 3: Commit**

```bash
git add admin/dayof-timeline.js
git commit -m "feat: resize timeline blocks to change their end time"
```

---

### Task 8: Click-to-edit + wire the lane manager button

**Files:**
- Modify: `admin/dayof.js` (export `openDayOfPanel`, add "Gérer les lanes" button, pass `onBlockClick`)
- Modify: `admin/dayof-timeline.js` (fire `onBlockClick` on a genuine click, not after a drag)

**Interfaces:**
- Consumes: `openLaneManagerPanel` from `admin/timeline-lanes.js` (Task 2).
- Produces: `openDayOfPanel` becomes an exported function (was module-private), so `admin/dayof.js` can pass it as the `onBlockClick` callback into `renderTimelineGrid` without `dayof-timeline.js` importing `dayof.js` back (avoids a circular import — `dayof-timeline.js` only ever calls the callback it's given).

- [ ] **Step 1: Fire `onBlockClick` on plain clicks in `attachDragHandlers`**

In `admin/dayof-timeline.js`, extend the move handler's `onMouseUp` (from Task 6) to call `onBlockClick` when nothing moved. Change the function signature and body:

```js
function attachDragHandlers(block, items, onItemMoved, onBlockClick) {
  const itemId = block.dataset.itemId;

  block.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('timeline-resize-handle')) return;
    e.preventDefault();
    const item = items.find(i => i.id === itemId);
    const startY = e.clientY;
    const startMin = timeToMinutes(item.time);
    const endMin = item.endTime ? timeToMinutes(item.endTime) : startMin + DEFAULT_DURATION_MIN;
    const durationMin = endMin - startMin;
    let moved = false;
    let finalStartMin = startMin;

    function onMouseMove(ev) {
      const deltaPx = ev.clientY - startY;
      if (Math.abs(deltaPx) > 3) moved = true;
      const deltaMinRaw = deltaPx / PX_PER_MIN;
      const snappedDelta = Math.round(deltaMinRaw / SNAP_MIN) * SNAP_MIN;
      let newStart = startMin + snappedDelta;
      newStart = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - durationMin, newStart));
      finalStartMin = newStart;
      block.style.top = `${(newStart - DAY_START_MIN) * PX_PER_MIN}px`;
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (moved && finalStartMin !== startMin) {
        onItemMoved(itemId, minutesToTime(finalStartMin), minutesToTime(finalStartMin + durationMin));
      } else if (!moved) {
        onBlockClick(itemId);
      }
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  const handle = block.querySelector('.timeline-resize-handle');
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const item = items.find(i => i.id === itemId);
    const startY = e.clientY;
    const startMin = timeToMinutes(item.time);
    const initialEndMin = item.endTime ? timeToMinutes(item.endTime) : startMin + DEFAULT_DURATION_MIN;
    let finalEndMin = initialEndMin;

    function onMouseMove(ev) {
      const deltaPx = ev.clientY - startY;
      const deltaMinRaw = deltaPx / PX_PER_MIN;
      const snappedDelta = Math.round(deltaMinRaw / SNAP_MIN) * SNAP_MIN;
      let newEnd = initialEndMin + snappedDelta;
      newEnd = Math.max(startMin + SNAP_MIN, Math.min(DAY_END_MIN, newEnd));
      finalEndMin = newEnd;
      block.style.height = `${(newEnd - startMin) * PX_PER_MIN}px`;
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (finalEndMin !== initialEndMin) {
        onItemMoved(itemId, minutesToTime(startMin), minutesToTime(finalEndMin));
      }
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}
```

Update its call site (inside `renderTimelineGrid`):

```js
  if (editable) {
    container.querySelectorAll('.timeline-block').forEach(block => {
      attachDragHandlers(block, items, onItemMoved, onBlockClick);
    });
  } else {
    container.querySelectorAll('.timeline-block').forEach(block => {
      block.style.cursor = 'default';
      block.addEventListener('click', () => onBlockClick(block.dataset.itemId));
    });
  }
```

(Read-only users can still click a block to view details — `openDayOfPanel` already renders disabled/no-op inputs when `!canWrite`, matching the existing table view's pattern... actually check: `openDayOfPanel` currently has no read-only rendering path since it's only reachable from the "Modifier" button which is itself gated by `editable`. Keep parity: only wire the click-to-view in read-only mode if `openDayOfPanel` is safe to open read-only. It is not guarded — **do not** open it for read-only users to avoid exposing an edit UI with a working save button. Change the `else` branch above to a no-op instead:)

```js
  } else {
    container.querySelectorAll('.timeline-block').forEach(block => {
      block.style.cursor = 'default';
    });
  }
```

- [ ] **Step 2: Export `openDayOfPanel` from `admin/dayof.js`**

Change (current line 112):

```js
function openDayOfPanel(id, items, guests, vendors, lanes) {
```

to:

```js
export function openDayOfPanel(id, items, guests, vendors, lanes) {
```

- [ ] **Step 3: Wire `onBlockClick` in the `renderTimelineGrid` call**

In `admin/dayof.js`, update the Task 6 call site:

```js
  if (currentView === 'frise') {
    renderTimelineGrid(document.getElementById('dayof-timeline-view'), lanes, items, {
      onBlockClick: (id) => openDayOfPanel(id, items, guests, vendors, lanes),
      onItemMoved: async (id, newTime, newEndTime) => {
        await updateDoc(doc(db, 'runOfShow', id), { time: newTime, endTime: newEndTime });
        renderDayOfTab();
      },
      editable,
    });
  }
```

- [ ] **Step 4: Add the "Gérer les lanes" button**

In `admin/dayof.js`, extend the toolbar markup added in Task 4:

```js
    <div class="no-print" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="display:flex;gap:10px;align-items:center">
        <div class="btn-group" style="margin-bottom:0;width:auto">
          <button class="btn-group-item dayof-view-btn ${currentView === 'table' ? 'active' : ''}" data-view="table">Tableau</button>
          <button class="btn-group-item dayof-view-btn ${currentView === 'frise' ? 'active' : ''}" data-view="frise">Frise</button>
        </div>
        ${editable ? '<button id="manage-lanes-btn" class="btn-secondary">Gérer les lanes</button>' : ''}
      </div>
      <button id="print-dayof-btn" class="btn-secondary">Imprimer</button>
    </div>
```

Add its listener next to the view-toggle listeners (Task 4 Step 3), and import `openLaneManagerPanel`:

```js
import { loadLanes, GENERAL_LANE_ID, openLaneManagerPanel } from './timeline-lanes.js?v=1';
```

```js
  if (editable) {
    document.getElementById('manage-lanes-btn').addEventListener('click', () => {
      openLaneManagerPanel(lanes, () => renderDayOfTab());
    });
  }
```

- [ ] **Step 5: Manual verification**

Reload preview. In Frise view, click a block without dragging: expect the edit panel to open pre-filled with that item's data, including its lane. Save a change: expect the frise to re-render with the update. Click "Gérer les lanes": panel opens, add/rename/reorder/delete a lane, close, confirm the frise's columns update accordingly. Confirm a read-only account sees no "Gérer les lanes" button and can't drag/resize/click-to-edit blocks.

- [ ] **Step 6: Commit**

```bash
git add admin/dayof.js admin/dayof-timeline.js
git commit -m "feat: wire click-to-edit and lane manager button into timeline view"
```

---

### Task 9: Cache-bust version bumps + full verification pass

**Files:**
- Modify: `admin/script.js:10` (bump `dayof.js` import version)
- Modify: `admin/index.html:103` (bump `script.js` version)

**Interfaces:** None — this task only touches cache-busting query strings, no behavior change.

- [ ] **Step 1: Bump `dayof.js` import version in `admin/script.js`**

```js
import { renderDayOfTab } from './dayof.js?v=3';
```

- [ ] **Step 2: Bump the top-level script version in `admin/index.html`**

```html
<script type="module" src="/admin/script.js?v=23"></script>
```

- [ ] **Step 3: Full manual regression pass in the browser**

Using the `wedding` preview server:
1. Table view: create, edit (including new endTime/lane fields), mark done, delete, print — all match pre-existing behavior plus the two new columns.
2. Frise view, desktop width: hour axis renders 06:00-23:00, lanes match `timelineLanes` order/colors, blocks positioned correctly, drag moves (15min snap, clamped to grid), resize changes end time (15min snap, min 15min, clamped), click opens edit panel.
3. Frise view, mobile width (<768px): tabs appear, switching tabs filters the visible lane, drag/resize/click still work within the active lane.
4. Lane manager: add/rename/reorder/delete a lane; deleting a lane with assigned items reassigns them to "Général" (verify in table view — no data loss).
5. Read-only account (`dayof` permission = `read`): no "+ Ajouter une ligne", no "Gérer les lanes", no edit/delete buttons in table, no drag/resize/click-to-edit in frise — view-only in both views.
6. Browser console: no errors during any of the above.

- [ ] **Step 4: Commit**

```bash
git add admin/script.js admin/index.html
git commit -m "chore: bump cache-busting versions for timeline view"
```
