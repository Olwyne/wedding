# Invitation Guest Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap the number of adults/children an invited guest can RSVP for, let the admin name the expected people per invitation up front, and add a global "children allowed" toggle that strips children entirely from both the admin and public form when disabled.

**Architecture:** Extend the existing `guests` doc with an `expectedGuests[]` list (name optional, typed `adult`/`child`) plus denormalized `maxAdults`/`maxChildren` counts. Extend `admin/guests.js`'s edit panel with a dynamic named-list editor (same pattern as `admin/vendors.js`'s payments list) instead of free numeric inputs. Add a new `settings/general` doc + a new admin "Paramètres" tab (`admin/settings.js`) for the global children toggle, following the exact tab-registration pattern already used by every other admin section. The public RSVP form (`script.js`) reads the guest's max and the global toggle to constrain and label its adults/children inputs. Firestore rules enforce the cap server-side on the public RSVP write path.

**Tech Stack:** Vanilla JS (ES modules), Firebase Firestore v10 modular SDK, no build step, no test framework (project has none — verification is manual in-browser).

## Global Constraints

- `guests` doc gains `expectedGuests: [{ name: string, type: 'adult'|'child' }]`, `maxAdults: number`, `maxChildren: number`. `maxAdults`/`maxChildren` are always derived from `expectedGuests` (count by type) and stored denormalized — never edited directly by the admin.
- Guests created before this feature (no `expectedGuests`/`maxAdults`/`maxChildren` fields) fall back everywhere to: `expectedGuests = [{ name: guest.name || '', type: 'adult' }]`, `maxAdults = 1`, `maxChildren = 0`. No migration script — the fallback applies live on every read.
- New doc `settings/general: { childrenAllowed: boolean }`, defaults to `true` when the doc doesn't exist yet.
- When `childrenAllowed === false`: the admin's per-row "Enfant" option is disabled (existing child rows stay as data, just can't be created/re-selected), and the public form removes the children input, its label, and any child-name sub-fields entirely (not just hidden).
- Cache-busting: every `?v=N` query on a module import or `<script>`/`<link>` tag must be bumped by 1 in every file that references it, whenever that file's content changes — follow the existing convention exactly (see current versions below, don't skip any importer).
- Follow existing code style: `escapeHtml` on all interpolated user text, `canWrite(section)` / `canRead(section)` gating in admin, direct Firestore calls, no extra abstraction layers, no build step.

---

### Task 1: Admin — named expected-guests list replaces numeric max fields

**Files:**
- Modify: `admin/guests.js`
- Modify: `admin/styles.css`
- Modify (cache-bust only, `guests.js?v=5` → `?v=6`): `admin/dashboard.js:2`, `admin/dayof.js:8`, `admin/script.js:5`, `admin/tables.js:6`, `admin/tasks-shared.js:7`, `admin/todo.js:5`, `admin/witnesses.js:4`

**Interfaces:**
- Produces: `guests` docs now carry `expectedGuests`, `maxAdults`, `maxChildren` (consumed by Task 3's public form and Task 4's Firestore rules). `renderGuestsTab()` (existing export, unchanged signature).
- Consumes: nothing new from other tasks.

- [ ] **Step 1: Add derive/fallback helpers near the top of `admin/guests.js`**

In `admin/guests.js`, right after the `generateToken` function (currently ends at line 30), add:

```js
function expectedGuestsOf(guest) {
  return guest?.expectedGuests || [{ name: guest?.name || '', type: 'adult' }];
}

function computeMaxCounts(expectedGuests) {
  const maxAdults = expectedGuests.filter(p => p.type === 'adult').length;
  const maxChildren = expectedGuests.filter(p => p.type === 'child').length;
  return { maxAdults, maxChildren };
}

function formatMax(g) {
  const maxAdults = g.maxAdults ?? 1;
  const maxChildren = g.maxChildren ?? 0;
  return `${maxAdults}A / ${maxChildren}E`;
}
```

- [ ] **Step 2: Add a "Max" column to the guests table**

In `admin/guests.js`, `renderGuestRow` (currently lines 37-72), change the row markup — insert a new `<td>` right after the "Côté" cell:

```js
    <tr class="guest-row" data-id="${escapeHtml(g.id)}">
      <td>${escapeHtml(g.name)}</td>
      <td><span class="badge ${SIDE_BADGE[side]}">${SIDE_LABELS[side]}</span></td>
      <td>${formatMax(g)}</td>
      <td><div class="pills">${pills}</div></td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>${rsvp.adults ?? ''}</td>
      <td>${rsvp.children ?? ''}</td>
      <td>
        <button class="btn-icon btn-copy-link" data-token="${escapeHtml(g.id)}" title="Copier le lien">${LINK_ICON}</button>
      </td>
      <td>${actionsCell}</td>
    </tr>`;
```

In `renderGuestsTab` (currently lines 133-187), update the table header and empty-state colspan:

```js
      <thead>
        <tr>
          <th>Nom</th><th>Côté</th><th>Max</th><th>Événements</th><th>RSVP</th>
          <th>Adultes</th><th>Enfants</th><th>Lien</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${guests.length
          ? guests.map(g => renderGuestRow(g, eventById, editable)).join('')
          : '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:40px">Aucun invité.</td></tr>'}
      </tbody>
```

- [ ] **Step 3: Replace the numeric-max concept with a dynamic named-list editor in `openGuestPanel`**

In `admin/guests.js`, `openGuestPanel` (currently lines 233-347), replace the whole function:

```js
function renderExpectedGuestRow(p, idx) {
  return `
    <div class="expected-guest-row" data-idx="${idx}">
      <input type="text" class="eg-name" placeholder="Nom (optionnel)" value="${escapeHtml(p.name || '')}">
      <select class="eg-type">
        <option value="adult" ${p.type === 'adult' ? 'selected' : ''}>Adulte</option>
        <option value="child" ${p.type === 'child' ? 'selected' : ''}>Enfant</option>
      </select>
      <button type="button" class="btn-icon eg-remove" data-idx="${idx}">✕</button>
    </div>`;
}

function openGuestPanel(id, guests, events) {
  const guest = id ? guests.find(g => g.id === id) : null;
  const isNew = !guest;

  const assignedSet = new Set(guest?.assignedEvents || []);
  const expectedGuests = isNew
    ? [{ name: '', type: 'adult' }]
    : expectedGuestsOf(guest).map(p => ({ ...p }));

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${isNew ? 'Nouvel invité' : 'Modifier l\'invité'}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      <label class="field">
        <span>Nom</span>
        <input id="guest-name" value="${escapeHtml(guest?.name || '')}" required>
      </label>
      <div class="field">
        <span>Côté</span>
        <div class="btn-group" id="side-group">
          ${['marie','mariee','deux'].map(s => `
            <button type="button" class="btn-group-item ${(guest?.side || 'deux') === s ? 'active' : ''}" data-side="${s}">
              ${SIDE_LABELS[s]}
            </button>`).join('')}
        </div>
      </div>
      <div class="field">
        <span>Personnes attendues</span>
        <div class="expected-guest-list" id="expected-guest-list"></div>
        <button type="button" class="btn-secondary" id="eg-add">+ Ajouter une personne</button>
        <p class="expected-guest-summary" id="expected-guest-summary"></p>
      </div>
      <div class="field">
        <span>Événements</span>
        <div class="event-cards" id="event-cards">
          ${events.map(e => `
            <div class="event-card ${assignedSet.has(e.id) ? 'selected' : ''}" data-event-id="${escapeHtml(e.id)}">
              <div class="event-card-check">${assignedSet.has(e.id) ? '✓' : ''}</div>
              <div class="event-card-info">
                <div class="event-card-title">${escapeHtml(e.title_fr)}</div>
                <div class="event-card-meta">${escapeHtml(e.time_fr)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
      <div id="invite-result" hidden></div>
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">${isNew ? 'Créer' : 'Enregistrer'}</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); renderGuestsTab(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  // Side toggle
  panelEl.querySelectorAll('.btn-group-item').forEach(btn => {
    btn.addEventListener('click', () => {
      panelEl.querySelectorAll('.btn-group-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Expected guests list
  function refreshExpectedGuestList() {
    const listEl = panelEl.querySelector('#expected-guest-list');
    listEl.innerHTML = expectedGuests.map((p, i) => renderExpectedGuestRow(p, i)).join('');
    listEl.querySelectorAll('.eg-name').forEach(input =>
      input.addEventListener('input', e => {
        expectedGuests[Number(e.target.closest('.expected-guest-row').dataset.idx)].name = e.target.value;
      })
    );
    listEl.querySelectorAll('.eg-type').forEach(select =>
      select.addEventListener('change', e => {
        expectedGuests[Number(e.target.closest('.expected-guest-row').dataset.idx)].type = e.target.value;
        refreshSummary();
      })
    );
    listEl.querySelectorAll('.eg-remove').forEach(btn =>
      btn.addEventListener('click', () => {
        if (expectedGuests.length <= 1) return;
        expectedGuests.splice(Number(btn.dataset.idx), 1);
        refreshExpectedGuestList();
      })
    );
    refreshSummary();
  }
  function refreshSummary() {
    const { maxAdults, maxChildren } = computeMaxCounts(expectedGuests);
    panelEl.querySelector('#expected-guest-summary').textContent = `Max actuel : ${maxAdults} adulte(s) / ${maxChildren} enfant(s)`;
  }
  refreshExpectedGuestList();

  panelEl.querySelector('#eg-add').addEventListener('click', () => {
    expectedGuests.push({ name: '', type: 'adult' });
    refreshExpectedGuestList();
  });

  // Event card toggle
  panelEl.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('click', () => {
      card.classList.toggle('selected');
      card.querySelector('.event-card-check').textContent =
        card.classList.contains('selected') ? '✓' : '';
    });
  });

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const saveBtn = panelEl.querySelector('#panel-save');
    saveBtn.disabled = true;
    saveBtn.textContent = isNew ? 'Création…' : 'Enregistrement…';

    const name = panelEl.querySelector('#guest-name').value.trim();
    if (!name) { saveBtn.disabled = false; saveBtn.textContent = isNew ? 'Créer' : 'Enregistrer'; return; }

    const side = panelEl.querySelector('.btn-group-item.active')?.dataset.side || 'deux';
    const assignedEvents = Array.from(
      panelEl.querySelectorAll('.event-card.selected')
    ).map(c => c.dataset.eventId);
    const { maxAdults, maxChildren } = computeMaxCounts(expectedGuests);

    if (id) {
      await updateDoc(doc(db, 'guests', id), { name, side, assignedEvents, expectedGuests, maxAdults, maxChildren });
      close();
    } else {
      const token = generateToken();
      await setDoc(doc(db, 'guests', token), {
        name, side, assignedEvents, expectedGuests, maxAdults, maxChildren,
        createdAt: new Date().toISOString(),
        rsvp: { status: 'pending', name: '', email: '', phone: '', adults: 0, children: 0, extraAdultNames: [], childNames: [], diet: '', message: '', confirmedEvents: {}, respondedAt: null },
      });
      const inviteUrl = `${location.origin}/?invite=${token}`;
      const resultEl = panelEl.querySelector('#invite-result');
      resultEl.hidden = false;
      resultEl.innerHTML = `
        <div class="guest-invite-result">
          <span style="flex:1">${escapeHtml(inviteUrl)}</span>
          <button class="btn-secondary" id="copy-new-link">Copier</button>
        </div>`;
      resultEl.querySelector('#copy-new-link').addEventListener('click', async () => {
        await navigator.clipboard.writeText(inviteUrl);
        resultEl.querySelector('#copy-new-link').textContent = 'Copié !';
      });
      saveBtn.textContent = 'Créé ✓';
      panelEl.querySelector('#panel-cancel').textContent = 'Fermer';
    }
  });
}
```

Note: the remove button is a no-op when only one row is left (`expectedGuests.length <= 1` guard) — an invitation always needs at least one expected person.

- [ ] **Step 4: Add CSS for the expected-guests list**

Append to `admin/styles.css`:

```css
.expected-guest-list{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
.expected-guest-row{display:flex;align-items:center;gap:8px}
.expected-guest-row .eg-name{flex:1;min-width:0}
.expected-guest-row .eg-type{width:110px}
.expected-guest-summary{color:var(--muted);font-size:12.5px;margin:0}
```

- [ ] **Step 5: Bump `guests.js` cache-busting version everywhere it's imported**

Change `./guests.js?v=5` to `./guests.js?v=6` in each of these lines:
- `admin/dashboard.js:2`
- `admin/dayof.js:8`
- `admin/script.js:5`
- `admin/tables.js:6`
- `admin/tasks-shared.js:7`
- `admin/todo.js:5`
- `admin/witnesses.js:4`

- [ ] **Step 6: Manual verification**

With an admin user that has `write` on `guests`:
- Open Invités → table now shows a "Max" column, e.g. `1A / 0E` for existing guests (fallback working).
- Click "+ Ajouter un invité" → panel shows one "Personnes attendues" row pre-filled Adulte, empty name, summary reads "Max actuel : 1 adulte(s) / 0 enfant(s)".
- Click "+ Ajouter une personne" twice, set one to "Enfant" with no name, one to "Adulte" named "Marie Dupont" → summary updates live to "Max actuel : 2 adulte(s) / 1 enfant(s)".
- Remove a row → list and summary update; try removing down to the last row → remove button on the sole remaining row does nothing (row persists).
- Save → close and reopen the same guest → the exact rows (names, types) are restored; "Max" column in the table shows `2A / 1E`.
- Open an old guest created before this change (no `expectedGuests` in Firestore) → panel shows exactly one row, "Adulte", name pre-filled with the guest's display name; table shows `1A / 0E`.
- Switch to a `read`-only user on `guests` → no "+ Ajouter" button, "Max" column still visible in read-only table.
- Open the browser console throughout — no errors.

- [ ] **Step 7: Commit**

```bash
rtk git add admin/guests.js admin/styles.css admin/dashboard.js admin/dayof.js admin/script.js admin/tables.js admin/tasks-shared.js admin/todo.js admin/witnesses.js
rtk git commit -m "$(cat <<'EOF'
feat: replace numeric guest max with named expected-guests list

Admin now enters the expected people per invitation by name (optional)
and type (adulte/enfant); maxAdults/maxChildren are derived from that
list instead of being typed in directly.
EOF
)"
```

---

### Task 2: Admin — global "Enfants autorisés" setting and new Paramètres tab

**Files:**
- Create: `admin/settings.js`
- Modify: `admin/sections-registry.js`
- Modify: `admin/index.html`
- Modify: `admin/script.js`
- Modify: `admin/users.js` (cache-bust only)
- Modify: `admin/guests.js` (gate the "Enfant" option)
- Modify: `admin/styles.css`
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: `canRead`/`canWrite` from `./permissions.js` (existing). `db` from `../firebase-init.js` (existing).
- Produces: `loadChildrenAllowed()` — async function in `admin/settings.js`, returns `Promise<boolean>` (defaults `true` if the doc doesn't exist). `renderSettingsTab()` — exported render function, same shape as every other tab's `render*Tab()`. Both consumed by Task 3 (public form needs the same on-boolean semantics, implemented independently there since it's a different runtime/bundle — see Task 3).

- [ ] **Step 1: Add the `settings` section to the permissions registry**

In `admin/sections-registry.js`, add a new entry to the `SECTIONS` array (after `'users'`):

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
  { id: 'todo', label: 'To-Do', collection: 'tasks' },
  { id: 'calendar', label: 'Calendrier', collection: 'tasks' },
  { id: 'users', label: 'Utilisateurs', collection: 'admins' },
  { id: 'settings', label: 'Paramètres', collection: 'settings' },
];
```

This alone makes `admin/users.js`'s permission editor show a "Paramètres" select (it's built from `SECTIONS`, no further change needed there).

- [ ] **Step 2: Create `admin/settings.js`**

```js
// admin/settings.js
import { db } from '../firebase-init.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';

const generalDocRef = doc(db, 'settings', 'general');

export async function loadChildrenAllowed() {
  try {
    const snap = await getDoc(generalDocRef);
    return snap.exists() && snap.data().childrenAllowed === false ? false : true;
  } catch (err) {
    console.error('loadChildrenAllowed failed', err);
    return true;
  }
}

async function saveChildrenAllowed(value) {
  await setDoc(generalDocRef, { childrenAllowed: value }, { merge: true });
}

export async function renderSettingsTab() {
  const panel = document.getElementById('tab-settings');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';
  document.getElementById('section-action').innerHTML = '';

  const editable = canWrite('settings');
  const childrenAllowed = await loadChildrenAllowed();

  panel.innerHTML = `
    <div class="settings-row">
      <label class="toggle">
        <input type="checkbox" id="setting-children-allowed" ${childrenAllowed ? 'checked' : ''} ${editable ? '' : 'disabled'}>
        <span class="toggle-track"></span>
      </label>
      <div>
        <div class="settings-row-title">Enfants autorisés</div>
        <div class="settings-row-sub">Si désactivé, les champs enfants disparaissent du formulaire public et de la fiche invité.</div>
      </div>
    </div>`;

  if (editable) {
    panel.querySelector('#setting-children-allowed').addEventListener('change', async e => {
      e.target.disabled = true;
      try {
        await saveChildrenAllowed(e.target.checked);
      } catch (err) {
        console.error('saveChildrenAllowed failed', err);
        e.target.checked = !e.target.checked;
        alert(`Erreur : ${err.message}`);
      } finally {
        e.target.disabled = false;
      }
    });
  }
}
```

- [ ] **Step 3: Register the "Paramètres" nav item and tab panel in `admin/index.html`**

Add a new nav button right after the "Utilisateurs" button (currently lines 72-74):

```html
      <button class="nav-item" data-section="users" hidden>
        <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/></svg></span> Utilisateurs
      </button>
      <button class="nav-item" data-section="settings" hidden>
        <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span> Paramètres
      </button>
```

Add a new tab panel right after `tab-users` (currently line 98):

```html
      <div id="tab-users" class="tab-panel" hidden></div>
      <div id="tab-settings" class="tab-panel" hidden></div>
```

Bump the two version query strings in this same file:
- Line 7: `<link rel="stylesheet" href="/admin/styles.css?v=20">` → `?v=21`
- Line 103: `<script type="module" src="/admin/script.js?v=24"></script>` → `?v=25`

- [ ] **Step 4: Wire the new tab into `admin/script.js`**

In `admin/script.js`, add the import (after the `renderUsersTab` import, currently line 12):

```js
import { renderUsersTab } from './users.js?v=1';
import { renderSettingsTab } from './settings.js?v=1';
```

Add it to `RENDER_BY_ID` (currently lines 15-26):

```js
const RENDER_BY_ID = {
  blocks: renderBlocksTab,
  vendors: renderVendorsTab,
  budget: renderBudgetTab,
  guests: renderGuestsTab,
  tables: renderTablesTab,
  witnesses: renderWitnessesTab,
  events: renderEventsTab,
  dayof: renderDayOfTab,
  todo: renderTodoTab,
  calendar: renderCalendarTab,
  users: renderUsersTab,
  settings: renderSettingsTab,
};
```

Add the URL slug mapping (currently line 30):

```js
const SLUG_BY_SECTION = { dashboard: 'dashboard', blocks: 'content', vendors: 'vendors', budget: 'budget', guests: 'guest', tables: 'tables', witnesses: 'witnesses', events: 'events', dayof: 'dayof', todo: 'todo', calendar: 'calendar', users: 'users', settings: 'settings' };
```

Bump the two `?v=` imports this file already carries, since its own content changed and `guests.js` moved to v6 in Task 1:
- Line 5: `import { renderGuestsTab } from './guests.js?v=5';` → `./guests.js?v=6`
- Line 17: `import { SECTIONS as PERM_SECTIONS } from './sections-registry.js?v=1';` → `./sections-registry.js?v=2`

- [ ] **Step 5: Bump `sections-registry.js` version in `admin/users.js`**

In `admin/users.js`, line 13: `import { SECTIONS } from './sections-registry.js?v=1';` → `./sections-registry.js?v=2`

- [ ] **Step 6: Gate the "Enfant" option in the guest panel behind the global setting**

In `admin/guests.js`, the file currently starts with:

```js
// admin/guests.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadEvents } from './events.js?v=2';
import { canWrite } from './permissions.js';
```

Add one import line at the end of that block:

```js
// admin/guests.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadEvents } from './events.js?v=2';
import { canWrite } from './permissions.js';
import { loadChildrenAllowed } from './settings.js?v=1';
```

Change `openGuestPanel` to accept and use a `childrenAllowed` flag. Update its signature and the two call sites:

```js
function openGuestPanel(id, guests, events, childrenAllowed) {
```

In `renderExpectedGuestRow`, pass `childrenAllowed` through and disable the option:

```js
function renderExpectedGuestRow(p, idx, childrenAllowed) {
  return `
    <div class="expected-guest-row" data-idx="${idx}">
      <input type="text" class="eg-name" placeholder="Nom (optionnel)" value="${escapeHtml(p.name || '')}">
      <select class="eg-type" ${childrenAllowed ? '' : 'disabled'}>
        <option value="adult" ${p.type === 'adult' ? 'selected' : ''}>Adulte</option>
        <option value="child" ${p.type === 'child' ? 'selected' : ''}>Enfant</option>
      </select>
      <button type="button" class="btn-icon eg-remove" data-idx="${idx}">✕</button>
    </div>`;
}
```

Inside `openGuestPanel`, update the `refreshExpectedGuestList` function's mapping call:

```js
  function refreshExpectedGuestList() {
    const listEl = panelEl.querySelector('#expected-guest-list');
    listEl.innerHTML = expectedGuests.map((p, i) => renderExpectedGuestRow(p, i, childrenAllowed)).join('');
```

(The rest of `refreshExpectedGuestList` and the save handler are unchanged from Task 1 — a disabled `<select>` still submits its current value, so an existing "Enfant" row stays typed `child` even while locked.)

Update `renderGuestsTab` (the two places it calls `openGuestPanel`) to fetch and pass the flag:

```js
export async function renderGuestsTab() {
  const panel = document.getElementById('tab-guests');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('guests');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-guest-btn" class="btn-primary">+ Ajouter un invité</button>'
    : '';

  const [guests, events, childrenAllowed] = await Promise.all([loadGuests(), loadEvents(), loadChildrenAllowed()]);
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));

  panel.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Nom</th><th>Côté</th><th>Max</th><th>Événements</th><th>RSVP</th>
          <th>Adultes</th><th>Enfants</th><th>Lien</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${guests.length
          ? guests.map(g => renderGuestRow(g, eventById, editable)).join('')
          : '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:40px">Aucun invité.</td></tr>'}
      </tbody>
    </table>`;

  if (editable) {
    document.getElementById('add-guest-btn').addEventListener('click', () =>
      openGuestPanel(null, guests, events, childrenAllowed)
    );
    panel.querySelectorAll('.btn-edit-guest').forEach(btn =>
      btn.addEventListener('click', () => openGuestPanel(btn.dataset.id, guests, events, childrenAllowed))
    );
    panel.querySelectorAll('.btn-delete-guest').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer cet invité ?')) return;
        await deleteDoc(doc(db, 'guests', btn.dataset.id));
        renderGuestsTab();
      })
    );
  }
  panel.querySelectorAll('.btn-view-rsvp').forEach(btn =>
    btn.addEventListener('click', () => openRsvpDetail(guests.find(g => g.id === btn.dataset.id), eventById))
  );
  panel.querySelectorAll('.btn-copy-link').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = `${location.origin}/?invite=${btn.dataset.token}`;
      await navigator.clipboard.writeText(url);
      const orig = btn.innerHTML;
      btn.innerHTML = CHECK_ICON;
      setTimeout(() => { btn.innerHTML = orig; }, 1500);
    });
  });
}
```

- [ ] **Step 7: Bump `guests.js` version again (content changed in this task) and its importers**

`admin/guests.js` changed again in this task (Step 6), so bump `guests.js?v=6` → `?v=7` in the same 7 files touched in Task 1 Step 5, plus this task's own `admin/script.js` line 5 (already at `?v=6` from Step 4 above — change it to `?v=7` instead):
- `admin/dashboard.js:2`
- `admin/dayof.js:8`
- `admin/script.js:5` (→ `?v=7`, not `?v=6`)
- `admin/tables.js:6`
- `admin/tasks-shared.js:7`
- `admin/todo.js:5`
- `admin/witnesses.js:4`

- [ ] **Step 8: Add CSS for the settings row**

Append to `admin/styles.css`:

```css
.settings-row{display:flex;align-items:flex-start;gap:14px;padding:16px;background:var(--admin-card);border:1px solid var(--border);border-radius:8px;max-width:520px}
.settings-row-title{font-weight:600;margin-bottom:2px}
.settings-row-sub{color:var(--muted);font-size:12.5px}
```

- [ ] **Step 9: Add the `settings/general` Firestore rule**

In `firestore.rules`, add a new `match` block right after `match /guests/{guestId} { ... }` (before `match /blocks/{blockId}`):

```
    match /settings/general {
      allow read: if true;
      allow write: if perm('settings') == 'write';
    }

```

(Leave the existing `match /settings/budget { ... }` block untouched — it's a separate, unrelated fixed path.)

- [ ] **Step 10: Deploy the Firestore rules change**

```bash
firebase deploy --only firestore:rules
```

Expected: deploy succeeds, no syntax errors reported.

- [ ] **Step 11: Manual verification**

Grant your admin user `write` on the new "Paramètres" section (via Utilisateurs tab, or directly if you're the seed super-admin), then:
- Open the sidebar → new "Paramètres" nav item appears with a settings-gear icon; clicking it navigates to `/admin/settings/`.
- Toggle "Enfants autorisés" off → toggle visually switches, no page reload; reload the page → toggle is still off (persisted).
- Go to Invités → "+ Ajouter un invité" → every row's type `<select>` is disabled (greyed), stuck on whatever value it has (default "Adulte" for the new row).
- Toggle "Enfants autorisés" back on in Paramètres → return to Invités, open a guest panel → type `<select>` is enabled again.
- Switch to a `read`-only user on `settings` → toggle renders but is disabled, no ability to change it.
- A user with `none`/no permission on `settings` → "Paramètres" nav item stays hidden.
- Open the browser console throughout — no errors.

- [ ] **Step 12: Commit**

```bash
rtk git add admin/settings.js admin/sections-registry.js admin/index.html admin/script.js admin/users.js admin/guests.js admin/styles.css firestore.rules admin/dashboard.js admin/dayof.js admin/tables.js admin/tasks-shared.js admin/todo.js admin/witnesses.js
rtk git commit -m "$(cat <<'EOF'
feat: add global "children allowed" setting and Paramètres tab

New settings/general doc + admin tab controls a site-wide toggle; when
off, the guest panel's Enfant option is locked so new child rows can't
be created (existing ones are preserved, not deleted).
EOF
)"
```

---

### Task 3: Public RSVP form — dynamic cap, visible max, children removed when disallowed

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `index.html`

**Interfaces:**
- Consumes: `guests/{token}` doc fields `maxAdults`, `maxChildren` (Task 1) and `settings/general.childrenAllowed` (Task 2) — read directly via Firestore, no shared module with the admin (public bundle is intentionally separate).
- Produces: nothing consumed by later tasks — this is the last app-code task before the Firestore cap rule.

- [ ] **Step 1: Fetch the guest's max and the global children toggle in `loadGuestData`**

In `script.js`, replace `loadGuestData` (currently lines 132-166):

```js
  async function loadGuestData() {
    let token = '';
    try { token = (new URLSearchParams(window.location.search).get('invite') || '').trim(); } catch (e) {}
    if (!token) { state.access = 'public'; return; }

    try {
      const guestSnap = await getDoc(doc(db, 'guests', token));
      if (!guestSnap.exists()) { state.access = 'public'; return; }
      const guest = guestSnap.data();
      const [eventsSnap, settingsSnap] = await Promise.all([
        getDocs(collection(db, 'events')),
        getDoc(doc(db, 'settings', 'general')),
      ]);
      state.access = 'guest';
      state.guestToken = token;
      state.assignedEventIds = guest.assignedEvents || [];
      state.rawEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      state.maxAdults = guest.maxAdults ?? 1;
      state.maxChildren = guest.maxChildren ?? 0;
      state.childrenAllowed = settingsSnap.exists() && settingsSnap.data().childrenAllowed === false ? false : true;
      if (guest.rsvp && (guest.rsvp.status === 'confirmed' || guest.rsvp.status === 'declined')) {
        state.submitted = true;
        state.rsvp = {
          name: guest.rsvp.name || '',
          email: guest.rsvp.email || '',
          phone: guest.rsvp.phone || '',
          adults: guest.rsvp.adults ?? 1,
          children: guest.rsvp.children ?? 0,
          extraAdults: guest.rsvp.extraAdultNames || [],
          childNames: guest.rsvp.childNames || [],
          diet: guest.rsvp.diet || '',
          message: guest.rsvp.message || '',
          events: guest.rsvp.confirmedEvents || {},
          presence: guest.rsvp.status === 'declined' ? 'no' : 'yes',
        };
      }
    } catch (e) {
      console.error('Guest lookup failed', e);
      state.access = 'public';
    }
  }
```

- [ ] **Step 2: Add `maxAdults`/`maxChildren`/`childrenAllowed` to initial state**

In `script.js`, in the `state` object (currently lines 99-112), add three fields right after `assignedEventIds: [],`:

```js
    assignedEventIds: [],
    maxAdults: 1,
    maxChildren: 0,
    childrenAllowed: true,
    rsvp: { name: '', email: '', phone: '', adults: 1, children: 0, extraAdults: [], childNames: [], presence: null, events: {}, diet: '', message: '' },
```

- [ ] **Step 3: Add an intro-sentence builder helper**

In `script.js`, right after the `bf` helper function (currently ends at line 89), add:

```js
  function buildInviteIntro(lang, maxAdults, maxChildren, childrenEnabled) {
    if (lang === 'zh') {
      let s = `您受邀最多携${maxAdults}位成人`;
      if (childrenEnabled && maxChildren > 0) s += `及${maxChildren}位儿童`;
      return s + '出席。';
    }
    const adultWord = maxAdults > 1 ? 'adultes' : 'adulte';
    let s = `Vous êtes invité(s) pour ${maxAdults} ${adultWord}`;
    if (childrenEnabled && maxChildren > 0) {
      const childWord = maxChildren > 1 ? 'enfants' : 'enfant';
      s += ` et ${maxChildren} ${childWord}`;
    }
    return s + ' maximum.';
  }
```

- [ ] **Step 4: Add a localized "max" word to both language dicts**

In `script.js`, in `T.fr` (currently line 50), change:

```js
      fAdults: "Nombre d'adultes", fChildren: "Nombre d'enfants", fPresence: 'Je serai présent·e à :',
```
to:
```js
      fAdults: "Nombre d'adultes", fChildren: "Nombre d'enfants", fPresence: 'Je serai présent·e à :', maxWord: 'max',
```

In `T.zh` (currently line 69), change:

```js
      fAdults: '成人人数', fChildren: '儿童人数', fPresence: '我将出席：',
```
to:
```js
      fAdults: '成人人数', fChildren: '儿童人数', fPresence: '我将出席：', maxWord: '最多',
```

- [ ] **Step 5: Rewrite the adults/children block and its listeners in `buildRsvpBlock`**

In `script.js`, `buildRsvpBlock` (currently starts at line 592), replace the `<div id="rsvp-presence-yes" hidden>` block (currently lines 628-648):

```js
      <div id="rsvp-presence-yes" hidden>
        <p class="rsvp-invite-intro">${escapeHtml(buildInviteIntro(lang, state.maxAdults, state.maxChildren, state.childrenAllowed))}</p>
        <div class="field field-row">
          <label class="field">
            <span class="field-label">${escapeHtml(L.fAdults)} (${escapeHtml(L.maxWord)} ${state.maxAdults}) *</span>
            <input id="r-adults" type="number" min="1" max="${state.maxAdults}" value="${escapeHtml(String(Math.min(Number(state.rsvp.adults) || 1, state.maxAdults)))}">
          </label>
          ${state.childrenAllowed ? `
          <label class="field">
            <span class="field-label">${escapeHtml(L.fChildren)} (${escapeHtml(L.maxWord)} ${state.maxChildren}) *</span>
            <input id="r-children" type="number" min="0" max="${state.maxChildren}" value="${escapeHtml(String(Math.min(Number(state.rsvp.children) || 0, state.maxChildren)))}">
          </label>` : ''}
        </div>
        <div id="rsvp-extra-people"></div>
        <div class="field">
          <span class="field-label">${escapeHtml(L.fPresence)} *</span>
          <div id="rsvp-events" class="rsvp-events"></div>
        </div>
        <label class="field">
          <span class="field-label">${escapeHtml(L.fDiet)}</span>
          <input id="r-diet" type="text" placeholder="${escapeHtml(L.fDietPh)}" value="${escapeHtml(state.rsvp.diet)}">
        </label>
      </div>
```

Then, still inside `buildRsvpBlock`, replace `renderExtraPeople` (currently lines 671-696):

```js
    function renderExtraPeople() {
      const adults = Math.max(1, Math.min(Number(state.rsvp.adults) || 1, state.maxAdults));
      const children = state.childrenAllowed ? Math.max(0, Math.min(Number(state.rsvp.children) || 0, state.maxChildren)) : 0;
      const extraAdultsCount = Math.max(0, adults - 1);

      while (state.rsvp.extraAdults.length < extraAdultsCount) state.rsvp.extraAdults.push('');
      state.rsvp.extraAdults.length = extraAdultsCount;
      while (state.rsvp.childNames.length < children) state.rsvp.childNames.push('');
      state.rsvp.childNames.length = children;

      extraPeopleEl.innerHTML = '';
      state.rsvp.extraAdults.forEach((val, i) => {
        const label = document.createElement('label');
        label.className = 'field';
        label.innerHTML = `<span class="field-label">${escapeHtml(L.fExtraAdult)} ${i + 2} *</span><input type="text" required placeholder="${escapeHtml(L.fNamePh)}" value="${escapeHtml(val)}">`;
        label.querySelector('input').addEventListener('input', e => state.rsvp.extraAdults[i] = e.target.value);
        extraPeopleEl.appendChild(label);
      });
      if (state.childrenAllowed) {
        state.rsvp.childNames.forEach((val, i) => {
          const label = document.createElement('label');
          label.className = 'field';
          label.innerHTML = `<span class="field-label">${escapeHtml(L.fChildName)} ${i + 1} *</span><input type="text" required placeholder="${escapeHtml(L.fNamePh)}" value="${escapeHtml(val)}">`;
          label.querySelector('input').addEventListener('input', e => state.rsvp.childNames[i] = e.target.value);
          extraPeopleEl.appendChild(label);
        });
      }
    }
```

Then replace the adults/children input listeners (currently lines 711-712):

```js
    section.querySelector('#r-adults').addEventListener('input', e => {
      const v = Math.max(1, Math.min(Number(e.target.value) || 1, state.maxAdults));
      e.target.value = v;
      state.rsvp.adults = v;
      renderExtraPeople();
    });
    const childrenInput = section.querySelector('#r-children');
    if (childrenInput) {
      childrenInput.addEventListener('input', e => {
        const v = Math.max(0, Math.min(Number(e.target.value) || 0, state.maxChildren));
        e.target.value = v;
        state.rsvp.children = v;
        renderExtraPeople();
      });
    }
```

- [ ] **Step 6: Force `children` to 0 on submit when children are disallowed**

In `script.js`, inside the form's `submit` listener (currently around line 734), the confirmed-branch object already reads `children: Number(state.rsvp.children) || 0`. Since `state.rsvp.children` is never touched by user input when `childrenInput` doesn't exist (Step 5 guards the listener), no change is needed there — verify this by reading the surrounding code, don't add redundant logic.

- [ ] **Step 7: Add CSS for the intro sentence**

Append to `styles.css`:

```css
.rsvp-invite-intro{color:var(--parchment2);font-size:14px;line-height:1.6;margin-bottom:4px}
```

- [ ] **Step 8: Bump cache-busting versions**

In `index.html`:
- Line 10: `<link rel="stylesheet" href="styles.css?v=1">` → `?v=2`
- Line 82: `<script type="module" src="script.js?v=16"></script>` → `?v=17`

- [ ] **Step 9: Manual verification**

Using an invite link for a guest with `maxAdults: 2`, `maxChildren: 1` (set via the admin panel from Task 1) and `childrenAllowed: true` (Task 2 default):
- Open `/?invite=<token>` → answer "Oui" to presence → intro sentence reads "Vous êtes invité(s) pour 2 adultes et 1 enfant maximum." Labels read "Nombre d'adultes (max 2) *" and "Nombre d'enfants (max 1) *".
- Try typing `5` into the adults field → it snaps back to `2` on input; children field snaps to `1` max similarly.
- Set adults to 2 → a second "Adulte 2" name field appears; set children to 1 → an "Enfant 1" name field appears. Fill everything, submit → succeeds, thank-you screen shows.
- Switch language to 中文 → intro sentence and labels switch to the Chinese strings, numbers still correct.
- Now toggle "Enfants autorisés" off in the admin Paramètres tab (from Task 2), reload the guest's invite link → the children input, its label, and any child-name fields are entirely absent from the DOM (inspect via dev tools, not just visually hidden); intro sentence only mentions adults.
- Toggle "Enfants autorisés" back on → reload → children field reappears.
- Test a guest with `maxAdults: 1`, `maxChildren: 0` (a legacy/default guest) → adults field is stuck at 1 (max=1), no children field shown even with the global toggle on (since `maxChildren` is 0).
- Open the browser console throughout — no errors.

- [ ] **Step 10: Commit**

```bash
rtk git add script.js styles.css index.html
rtk git commit -m "$(cat <<'EOF'
feat: cap RSVP adults/children to invitation max, hide children when disallowed

Public form now reads maxAdults/maxChildren from the guest doc and the
global childrenAllowed setting, clamps input, shows the cap in the
labels and an intro sentence, and drops the children field entirely
when children aren't allowed.
EOF
)"
```

---

### Task 4: Firestore rules — server-side RSVP cap enforcement

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: `guests` doc fields `maxAdults`/`maxChildren` (Task 1), the existing `rsvp`-only update branch (unmodified structurally).
- Produces: nothing consumed later — last task in the plan.

- [ ] **Step 1: Add cap bounds to the public RSVP update rule**

In `firestore.rules`, replace the `match /guests/{guestId} { ... }` block:

```
    match /guests/{guestId} {
      allow get: if true;
      allow list: if perm('guests') in ['read', 'write'] || perm('witnesses') in ['read', 'write'] || perm('tables') in ['read', 'write'] || perm('dayof') in ['read', 'write'] || perm('todo') in ['read', 'write'] || perm('calendar') in ['read', 'write'];
      allow create, delete: if perm('guests') == 'write';
      allow update: if perm('guests') == 'write'
        || (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['rsvp'])
            && request.resource.data.rsvp.adults >= 0
            && request.resource.data.rsvp.adults <= (resource.data.maxAdults != null ? resource.data.maxAdults : 1)
            && request.resource.data.rsvp.children >= 0
            && request.resource.data.rsvp.children <= (resource.data.maxChildren != null ? resource.data.maxChildren : 0))
        || (perm('witnesses') == 'write' && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['weddingParty']));
    }
```

- [ ] **Step 2: Deploy the rules**

```bash
firebase deploy --only firestore:rules
```

Expected: deploy succeeds, no syntax errors.

- [ ] **Step 3: Manual verification — server-side cap actually blocks over-limit writes**

With a guest doc that has `maxAdults: 1`, `maxChildren: 0` (e.g. any legacy/default guest):
- Open its browser dev console on the public invite page, run:
  ```js
  import('/firebase-init.js').then(async ({ db }) => {
    const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    try {
      await updateDoc(doc(db, 'guests', '<that-guest-token>'), { rsvp: { status: 'confirmed', adults: 5, children: 0, name: 'x', email: '', phone: '', extraAdultNames: [], childNames: [], diet: '', message: '', confirmedEvents: {}, respondedAt: new Date().toISOString() } });
      console.log('unexpected: write succeeded');
    } catch (e) {
      console.log('expected: write rejected —', e.code);
    }
  });
  ```
  Expected: rejected with `permission-denied` (adults `5` exceeds `maxAdults: 1`).
- Re-run the same snippet with `adults: 1, children: 0` → expected: succeeds (within cap).
- Confirm the normal path still works end-to-end: submit a real RSVP through the public form for a guest with `maxAdults: 2, maxChildren: 1`, using exactly `adults: 2, children: 1` → succeeds and the admin Invités tab shows the updated RSVP.
- Confirm admin writes are unaffected: as an admin with `write` on `guests`, edit a guest's expected-guests list and save → succeeds regardless of any cap (admin path bypasses the cap branch via `perm('guests') == 'write'`).
- Open the browser console throughout the real-form tests — no errors.

- [ ] **Step 4: Commit**

```bash
rtk git add firestore.rules
rtk git commit -m "$(cat <<'EOF'
fix: enforce guest RSVP adult/child cap server-side in Firestore rules

Closes the gap where a direct Firestore API call (bypassing the public
form's client-side clamp) could still write an RSVP exceeding the
invitation's maxAdults/maxChildren.
EOF
)"
```

---

## Post-plan note

`settings/budget` (used by `admin/budget.js`, unrelated pre-existing doc) is untouched by this plan — Task 2 Step 9 adds a sibling `settings/general` rule block without modifying the existing one.
