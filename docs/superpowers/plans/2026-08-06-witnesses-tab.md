# Onglet Témoins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin "Témoins" tab where the couple manages, per side (Marié / Mariée), who is a témoin (max 2 per side) and who is a garçon/demoiselle d'honneur (unlimited), via drag-and-drop from the guest list.

**Architecture:** New `admin/witnesses.js` module following the existing per-section pattern (`guests.js`, `vendors.js`: one file exports a `renderXTab()` function that owns its DOM subtree). Data lives on existing `guests` docs via a new optional `weddingParty` field — no new Firestore collection. Registered through `admin/sections-registry.js`, which auto-wires nav visibility, routing, and per-user permissions.

**Tech Stack:** Vanilla JS (ES modules), Firebase Firestore v10 modular SDK, no build step, no test framework (project has none — verification is manual in-browser).

## Global Constraints

- One role per guest: `weddingParty: { role: 'temoin' | 'honneur', side: 'marie' | 'mariee' } | null`.
- Témoin slots hard-capped at 2 per side, client-side only (no Firestore rules change).
- Honneur lists unlimited.
- Desktop-only drag-and-drop (native HTML5 DnD), no touch support.
- Unassign only via explicit `×` button (not drag-to-pool).
- Follow existing code style: no semicolon-heavy defensive code, `escapeHtml` on all interpolated user text, `canWrite`/`canRead` gating from `admin/permissions.js`.

---

### Task 1: Register the section and wire nav/routing with a stub panel

**Files:**
- Modify: `admin/sections-registry.js`
- Modify: `admin/index.html:57-59` (add nav button after "Événements", before "Utilisateurs" — actually insert after guests per spec's information architecture; place it right after the "Invités" nav-item since témoins are guest-derived) and `admin/index.html:76-78` (add tab panel)
- Modify: `admin/script.js`
- Create: `admin/witnesses.js`

**Interfaces:**
- Produces: `renderWitnessesTab()` — async function, default export pattern matches siblings (`export async function renderWitnessesTab()`), takes no args, populates `#tab-witnesses`.

- [ ] **Step 1: Add the section to the registry**

Edit `admin/sections-registry.js`:

```js
export const SECTIONS = [
  { id: 'blocks', label: 'Blocs', collection: 'blocks' },
  { id: 'vendors', label: 'Prestations', collection: 'vendors' },
  { id: 'budget', label: 'Budget', collection: 'vendors' },
  { id: 'guests', label: 'Invités', collection: 'guests' },
  { id: 'witnesses', label: 'Témoins', collection: 'guests' },
  { id: 'events', label: 'Événements', collection: 'events' },
  { id: 'users', label: 'Utilisateurs', collection: 'admins' },
];
```

- [ ] **Step 2: Add the nav button and tab panel to the HTML**

In `admin/index.html`, insert this nav item right after the "Invités" `nav-item` block (after line 53's closing `</button>`, before the "Événements" button):

```html
      <button class="nav-item" data-section="witnesses" hidden>
        <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a5 5 0 0 1 5 5v2a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5z"/><path d="M8 21v-3a4 4 0 0 1 4-4 4 4 0 0 1 4 4v3"/></svg></span> Témoins
      </button>
```

And insert this tab panel right after `<div id="tab-guests" class="tab-panel" hidden></div>` (line 76):

```html
      <div id="tab-witnesses" class="tab-panel" hidden></div>
```

- [ ] **Step 3: Create the stub module**

Create `admin/witnesses.js`:

```js
// admin/witnesses.js
import { canWrite } from './permissions.js';

export async function renderWitnessesTab() {
  const panel = document.getElementById('tab-witnesses');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';
  document.getElementById('section-action').innerHTML = '';

  const editable = canWrite('witnesses');
  panel.innerHTML = `<p style="padding:20px;color:var(--muted)">Témoins — à venir (editable: ${editable})</p>`;
}
```

- [ ] **Step 4: Wire it into script.js**

Edit `admin/script.js`:

```js
import { renderWitnessesTab } from './witnesses.js?v=1';
```

Add to `RENDER_BY_ID` (after `guests: renderGuestsTab,`):

```js
  witnesses: renderWitnessesTab,
```

Add `witnesses: 'witnesses'` to `SLUG_BY_SECTION`:

```js
const SLUG_BY_SECTION = { dashboard: 'dashboard', blocks: 'content', vendors: 'vendors', budget: 'budget', guests: 'guest', witnesses: 'witnesses', events: 'events', users: 'users' };
```

- [ ] **Step 5: Manual verification**

Run the admin locally (open `admin/index.html` through your existing local Firebase-hosting preview flow, or `preview_start` on the project's dev command). Log in, confirm:
- "Témoins" appears in the sidebar nav between "Invités" and "Événements" (only if the logged-in user has `read`+ permission on `witnesses` — since it's a brand new permission key, existing admin users will have `none` by default; use `admin/users.js` UI, or manually set `permissions.witnesses = 'write'` on your own admin doc in the Firestore console, to see it).
- Clicking it shows the stub text and the URL becomes `/admin/witnesses/`.
- Reloading the URL directly lands back on the Témoins tab (routing works).

- [ ] **Step 6: Commit**

```bash
git add admin/sections-registry.js admin/index.html admin/script.js admin/witnesses.js
git commit -m "feat: register Témoins admin section with stub panel"
```

---

### Task 2: Render the two-column layout with pool, slots, and honneur lists (read-only)

**Files:**
- Modify: `admin/guests.js:11-12` (export the side label/badge maps)
- Modify: `admin/witnesses.js` (full render logic)
- Modify: `admin/styles.css` (new layout classes)

**Interfaces:**
- Consumes: `loadGuests()` from `admin/guests.js` — returns `Array<{ id, name, side, weddingParty?, ... }>` (existing function, already exported).
- Consumes: `SIDE_LABELS`, `SIDE_BADGE` from `admin/guests.js` (newly exported in this task) — `{ marie: string, mariee: string, deux: string }`.
- Produces: internal `renderPersonCard(guest, { removable })` — returns an HTML string `<div class="witness-card" draggable="true" data-id="...">...</div>`.

- [ ] **Step 1: Export the side maps from guests.js**

In `admin/guests.js`, change lines 11-12 from:

```js
const SIDE_LABELS = { marie: 'Marié', mariee: 'Mariée', deux: 'Les deux' };
const SIDE_BADGE  = { marie: 'badge-marie', mariee: 'badge-mariee', deux: 'badge-deux' };
```

to:

```js
export const SIDE_LABELS = { marie: 'Marié', mariee: 'Mariée', deux: 'Les deux' };
export const SIDE_BADGE  = { marie: 'badge-marie', mariee: 'badge-mariee', deux: 'badge-deux' };
```

(No other change needed — existing local uses inside `guests.js` still resolve since `export const` still declares the same binding.)

- [ ] **Step 2: Rewrite witnesses.js with full read-only render**

Replace the entire contents of `admin/witnesses.js`:

```js
// admin/witnesses.js
import { db } from '../firebase-init.js';
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadGuests, SIDE_LABELS, SIDE_BADGE } from './guests.js?v=4';
import { canWrite } from './permissions.js';

const SIDES = [
  { id: 'marie', label: 'Marié', honneurLabel: 'Garçons d\'honneur' },
  { id: 'mariee', label: 'Mariée', honneurLabel: 'Demoiselles d\'honneur' },
];

let cachedGuests = [];
let editableGlobal = false;

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderPersonCard(guest, { removable }) {
  const side = guest.side || 'deux';
  const removeBtn = removable
    ? `<button class="btn-icon witness-remove" data-id="${escapeHtml(guest.id)}" title="Retirer">✕</button>`
    : '';
  return `
    <div class="witness-card" draggable="${editableGlobal}" data-id="${escapeHtml(guest.id)}">
      <span class="witness-card-name">${escapeHtml(guest.name)}</span>
      <span class="badge ${SIDE_BADGE[side]}">${SIDE_LABELS[side]}</span>
      ${removeBtn}
    </div>`;
}

function renderColumn(sideDef, guests) {
  const temoins = guests.filter(g => g.weddingParty?.role === 'temoin' && g.weddingParty?.side === sideDef.id);
  const honneur = guests.filter(g => g.weddingParty?.role === 'honneur' && g.weddingParty?.side === sideDef.id);

  const slots = [0, 1].map(i => {
    const g = temoins[i];
    return g
      ? renderPersonCard(g, { removable: editableGlobal })
      : '<div class="witness-slot-empty">Vide</div>';
  }).join('');

  const honneurCards = honneur.length
    ? honneur.map(g => renderPersonCard(g, { removable: editableGlobal })).join('')
    : '<div class="witness-slot-empty">Aucun</div>';

  return `
    <div class="witness-column" data-side="${sideDef.id}">
      <h3>${sideDef.label}</h3>
      <div class="witness-section-label">Témoins (max 2)</div>
      <div class="witness-slots" data-side="${sideDef.id}" data-role="temoin">${slots}</div>
      <div class="witness-section-label">${sideDef.honneurLabel}</div>
      <div class="witness-honneur-list" data-side="${sideDef.id}" data-role="honneur">${honneurCards}</div>
    </div>`;
}

function renderPool(guests) {
  const pool = guests.filter(g => !g.weddingParty);
  const cards = pool.length
    ? pool.map(g => renderPersonCard(g, { removable: false })).join('')
    : '<p style="color:var(--muted)">Tous les invités sont assignés.</p>';
  return `
    <div class="witness-section-label">Invités disponibles</div>
    <div class="witness-pool" id="witness-pool">${cards}</div>`;
}

export async function renderWitnessesTab() {
  const panel = document.getElementById('tab-witnesses');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';
  document.getElementById('section-action').innerHTML = '';

  editableGlobal = canWrite('witnesses');
  cachedGuests = await loadGuests();

  panel.innerHTML = `
    <div class="witness-columns">
      ${SIDES.map(s => renderColumn(s, cachedGuests)).join('')}
    </div>
    ${renderPool(cachedGuests)}`;
}
```

- [ ] **Step 3: Add layout CSS**

Append to `admin/styles.css`:

```css
.witness-columns{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
.witness-column{background:#fff;border:1px solid var(--border);border-radius:10px;padding:16px}
.witness-column h3{font-size:15px;font-weight:600;color:var(--text);margin-bottom:12px}
.witness-section-label{font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);margin:14px 0 8px}
.witness-section-label:first-of-type{margin-top:0}
.witness-slots{display:flex;gap:10px}
.witness-slots,.witness-honneur-list{min-height:52px;border-radius:8px;padding:6px;background:var(--admin-bg)}
.witness-honneur-list{display:flex;flex-direction:column;gap:8px}
.witness-slots{flex-wrap:nowrap}
.witness-slots .witness-card,.witness-slots .witness-slot-empty{flex:1}
.witness-slot-empty{display:flex;align-items:center;justify-content:center;min-height:44px;border:1px dashed var(--border);border-radius:8px;color:var(--muted);font-size:12.5px}
.witness-card{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:13px;cursor:grab}
.witness-card-name{flex:1;font-weight:500;color:var(--text)}
.witness-pool{display:flex;flex-wrap:wrap;gap:8px;padding:12px;background:#fff;border:1px solid var(--border);border-radius:10px;min-height:52px}
.witness-pool .witness-card{cursor:grab}
```

- [ ] **Step 4: Manual verification**

Reload the Témoins tab. Confirm:
- Two columns render, "Marié" and "Mariée", each with a "Témoins (max 2)" row of 2 empty placeholders and an honneur section showing "Aucun".
- All guests with no `weddingParty` appear as cards in the "Invités disponibles" pool at the bottom, each showing name + their existing side badge.
- In the Firestore console, manually set one guest's `weddingParty` to `{ role: 'temoin', side: 'marie' }` and reload the tab — confirm that guest now shows in the Marié témoin slot instead of the pool, and a ✕ button appears if your admin user has write permission on `witnesses`.

- [ ] **Step 5: Commit**

```bash
git add admin/guests.js admin/witnesses.js admin/styles.css
git commit -m "feat: render witnesses columns, slots, and guest pool"
```

---

### Task 3: Drag-and-drop assignment with témoin slot cap

**Files:**
- Modify: `admin/witnesses.js`
- Modify: `admin/styles.css`

**Interfaces:**
- Consumes: `cachedGuests` (module-level array from Task 2), `renderWitnessesTab()` (self, for re-render after write).
- Produces: internal `assignWitness(guestId, side, role)` — async, returns `Promise<boolean>` (`true` on success, `false` if rejected by the témoin cap).

- [ ] **Step 1: Add the assign function and drag/drop handlers**

In `admin/witnesses.js`, add after `renderPool`:

```js
async function assignWitness(guestId, side, role) {
  if (role === 'temoin') {
    const currentCount = cachedGuests.filter(g =>
      g.id !== guestId &&
      g.weddingParty?.role === 'temoin' &&
      g.weddingParty?.side === side
    ).length;
    if (currentCount >= 2) return false;
  }
  await updateDoc(doc(db, 'guests', guestId), { weddingParty: { role, side } });
  return true;
}

function flashReject(el) {
  el.classList.remove('witness-shake');
  void el.offsetWidth;
  el.classList.add('witness-shake');
}

function attachDragEvents(panel) {
  if (!editableGlobal) return;

  panel.querySelectorAll('.witness-card[draggable="true"]').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
    });
  });

  panel.querySelectorAll('.witness-slots, .witness-honneur-list').forEach(target => {
    target.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      target.classList.add('witness-drag-over');
    });
    target.addEventListener('dragleave', () => {
      target.classList.remove('witness-drag-over');
    });
    target.addEventListener('drop', async e => {
      e.preventDefault();
      target.classList.remove('witness-drag-over');
      const guestId = e.dataTransfer.getData('text/plain');
      if (!guestId) return;
      const side = target.dataset.side;
      const role = target.dataset.role;
      const ok = await assignWitness(guestId, side, role);
      if (!ok) {
        flashReject(target);
        return;
      }
      renderWitnessesTab();
    });
  });
}
```

- [ ] **Step 2: Call attachDragEvents after render**

In `renderWitnessesTab()`, after the `panel.innerHTML = ...` block that sets the columns and pool, add:

```js
  attachDragEvents(panel);
```

(Full function body now ends with the innerHTML assignment followed by this call.)

- [ ] **Step 3: Add drag-over and shake CSS**

Append to `admin/styles.css`:

```css
.witness-drag-over{outline:2px dashed #6366f1;outline-offset:-2px;background:#eef2ff}
.witness-shake{animation:witness-shake .35s}
@keyframes witness-shake{
  0%,100%{transform:translateX(0)}
  20%{transform:translateX(-6px)}
  40%{transform:translateX(6px)}
  60%{transform:translateX(-4px)}
  80%{transform:translateX(4px)}
}
```

- [ ] **Step 4: Manual verification**

With an admin user that has write permission on `witnesses`:
- Drag a pool card onto the Marié "Témoins" row → it lands in a slot, pool card disappears, Firestore doc updated (check console/Firestore).
- Drag a second guest into the same slot area → second témoin fills the remaining empty slot.
- Drag a third guest into the same Marié témoin row → rejected: card stays in pool, the slots row visibly shakes, no Firestore write happens (verify via Firestore console — `weddingParty` unchanged on that guest).
- Drag a guest into the "Garçons d'honneur" list → appears there, repeat for a few more guests to confirm no cap.
- Drag an already-assigned témoin card directly into the honneur list of the same side → confirm it moves (role changes to honneur, freeing the témoin slot for a later drop).
- With a read-only (`canWrite` false) admin user, confirm cards are not `draggable` (check DOM attribute) and dragging does nothing.

- [ ] **Step 5: Commit**

```bash
git add admin/witnesses.js admin/styles.css
git commit -m "feat: drag-and-drop witness assignment with témoin cap"
```

---

### Task 4: Unassign via the ✕ button

**Files:**
- Modify: `admin/witnesses.js`

**Interfaces:**
- Consumes: `renderWitnessesTab()` (self, re-render after write).
- Produces: nothing consumed by later tasks (this is the last task).

- [ ] **Step 1: Add the unassign handler**

In `admin/witnesses.js`, add after `assignWitness`:

```js
async function unassignWitness(guestId) {
  await updateDoc(doc(db, 'guests', guestId), { weddingParty: null });
}
```

- [ ] **Step 2: Wire click events on ✕ buttons**

In `attachDragEvents(panel)`, add at the end of the function body (still inside the `if (!editableGlobal) return;` guard, so it only runs when editable):

```js
  panel.querySelectorAll('.witness-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      await unassignWitness(btn.dataset.id);
      renderWitnessesTab();
    });
  });
```

- [ ] **Step 3: Manual verification**

- Click ✕ on an assigned témoin card → it disappears from the slot (slot becomes "Vide" placeholder) and reappears in the pool.
- Click ✕ on an assigned honneur card → same, list item removed, guest returns to pool.
- Confirm in Firestore console that `weddingParty` is set to `null` on that guest doc after each removal.
- Full end-to-end pass: assign 2 témoins + 2 honneur per side, reload the page (fresh `renderWitnessesTab()` call via nav click), confirm state persists correctly from Firestore.

- [ ] **Step 4: Commit**

```bash
git add admin/witnesses.js
git commit -m "feat: unassign witnesses via remove button"
```

---

## Post-plan note

`admin/users.js` already iterates `SECTIONS` from `sections-registry.js` for the permissions UI — no task needed there; the `witnesses` entry from Task 1 makes it appear automatically. Existing admin users default to `permissions.witnesses` being absent (`canRead`/`canWrite` both return `false` via the `|| 'none'` fallback in `permissions.js`), so an admin (e.g. via the Utilisateurs tab or directly in Firestore) needs to grant `read`/`write` on `witnesses` to any user who should see the new tab — this is expected existing behavior for every new section, not a gap to fix.
