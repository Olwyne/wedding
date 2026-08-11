# Guest Email Prefill + Guests Table Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin pre-fill a guest's email before they RSVP (used as an editable default on the public form), and declutter the admin Invités table with event/status filters, a removed Événements column, and a collapsed ⋮ actions menu.

**Architecture:** Two independent, small features touching the same two files (`admin/guests.js`, `script.js`) — kept as separate tasks since they're independently testable and one (email) is a pure data/UI addition while the other (filters/declutter) is a table-rendering rework. Filters follow the exact `currentFilter`/`FILTERS` pattern already used in `admin/vendors.js`; the actions menu is a new small component with no existing equivalent in this codebase.

**Tech Stack:** Vanilla JS (ES modules), Firebase Firestore v10 modular SDK, no build step, no test framework (project has none — verification is manual in-browser).

## Global Constraints

- `guests` doc gains optional `email: string`, distinct from `rsvp.email` (set by the guest when they answer).
- Public form email prefill priority: `guest.rsvp.email` (if the guest already answered) wins over `guest.email` (admin prefill) wins over `''`. The field stays editable either way — this is a default value, not a lock.
- No "Email" column added to the admin table — the field lives only in the guest edit panel.
- Event filter: multi-select pills, OR semantics (guest shown if assigned to at least one selected event). "Tous les événements" pill clears the selection.
- Status filter: single-select pills (Tous/Confirmés/En attente/Refusés), same pattern as the existing `admin/vendors.js` status filter.
- The two filters combine with AND.
- Filter state lives in module-level variables (same convention as `admin/vendors.js`'s `currentFilter`) — persists while navigating between tabs in the same page session, resets only on a full page reload. Do not add persistence beyond that.
- "Événements" column removed from the guests table row entirely. The per-guest event assignment is still visible in the edit panel (`event-cards`, unchanged) and in the RSVP detail panel (`eventList`, unchanged).
- Actions column becomes a single "⋮" button per row opening a small menu: "Réponse" always, "Modifier" + "Supprimer" only when `canWrite('guests')`. The "Copier le lien" icon button stays outside the menu, unchanged.
- Follow existing code style: `escapeHtml` on all interpolated user text, `canWrite('guests')` gating, direct Firestore calls, no extra abstraction layers, no build step.

---

### Task 1: Admin — email field on the guest edit panel

**Files:**
- Modify: `admin/guests.js`

**Interfaces:**
- Produces: `guests` docs may now carry an `email` field (consumed by Task 2's public form read, and by nothing else in this plan).
- Consumes: nothing new from other tasks.

- [ ] **Step 1: Add the email input to the panel body**

In `admin/guests.js`, inside `openGuestPanel`'s template (currently lines 283-286), change:

```js
      <label class="field">
        <span>Nom</span>
        <input id="guest-name" value="${escapeHtml(guest?.name || '')}" required>
      </label>
```

to:

```js
      <label class="field">
        <span>Nom</span>
        <input id="guest-name" value="${escapeHtml(guest?.name || '')}" required>
      </label>
      <label class="field">
        <span>Email</span>
        <input id="guest-email" type="email" value="${escapeHtml(guest?.email || '')}" placeholder="email@exemple.com">
      </label>
```

- [ ] **Step 2: Save the email field**

In `admin/guests.js`, inside the `#panel-save` click handler (currently starting at line 382), the name is read at line 387:

```js
    const name = panelEl.querySelector('#guest-name').value.trim();
    if (!name) { saveBtn.disabled = false; saveBtn.textContent = isNew ? 'Créer' : 'Enregistrer'; return; }
```

Add the email read right after it:

```js
    const name = panelEl.querySelector('#guest-name').value.trim();
    if (!name) { saveBtn.disabled = false; saveBtn.textContent = isNew ? 'Créer' : 'Enregistrer'; return; }
    const email = panelEl.querySelector('#guest-email').value.trim();
```

Then include `email` in both writes. Change (currently lines 397-406):

```js
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
```

to:

```js
    if (id) {
      await updateDoc(doc(db, 'guests', id), { name, email, side, assignedEvents, expectedGuests, maxAdults, maxChildren });
      close();
    } else {
      const token = generateToken();
      await setDoc(doc(db, 'guests', token), {
        name, email, side, assignedEvents, expectedGuests, maxAdults, maxChildren,
        createdAt: new Date().toISOString(),
        rsvp: { status: 'pending', name: '', email: '', phone: '', adults: 0, children: 0, extraAdultNames: [], childNames: [], diet: '', message: '', confirmedEvents: {}, respondedAt: null },
      });
```

Note: the `rsvp: { ..., email: '', ... }` on the line above is the *guest's own future answer* placeholder — leave it as `''`, it is intentionally separate from the new top-level `email` field.

- [ ] **Step 3: Manual verification**

With an admin user that has `write` on `guests`:
- Open a guest panel (new or existing) → "Email" field appears right below "Nom", type `email`, no `required` attribute (optional).
- Type an email, save → reopen the same guest → the email is restored in the field.
- Leave it empty, save → reopen → field is empty, no error.
- Open the browser console throughout — no errors.

- [ ] **Step 4: Commit**

```bash
rtk git add admin/guests.js
rtk git commit -m "$(cat <<'EOF'
feat: add admin-editable email field to guest invitations

Lets the admin pre-fill a guest's email before they RSVP; separate
from rsvp.email, which is the guest's own submitted answer.
EOF
)"
```

---

### Task 2: Public form — prefill email from the admin-set value

**Files:**
- Modify: `script.js`

**Interfaces:**
- Consumes: `guests/{token}.email` (Task 1).
- Produces: nothing consumed later — independent of Task 3/4.

- [ ] **Step 1: Prefill `state.rsvp.email` for guests who haven't answered yet**

In `script.js`, `loadGuestData` (currently lines 150-190), the line setting `state.childrenAllowed` is at line 169:

```js
      state.childrenAllowed = settingsSnap && settingsSnap.exists() && settingsSnap.data().childrenAllowed === false ? false : true;
```

Add right after it:

```js
      state.childrenAllowed = settingsSnap && settingsSnap.exists() && settingsSnap.data().childrenAllowed === false ? false : true;
      state.rsvp.email = guest.email || '';
```

This covers the case where `guest.rsvp.status` is neither `confirmed` nor `declined` (the guest hasn't answered yet), since the `if` block below only runs for those two statuses and would otherwise leave `state.rsvp.email` at its initial `''`.

- [ ] **Step 2: Prefer the guest's own submitted answer over the admin prefill**

Still in `loadGuestData`, the confirmed/declined branch (currently lines 170-184) sets email at line 174:

```js
      if (guest.rsvp && (guest.rsvp.status === 'confirmed' || guest.rsvp.status === 'declined')) {
        state.submitted = true;
        state.rsvp = {
          name: guest.rsvp.name || '',
          email: guest.rsvp.email || '',
```

Change that one line to fall back to the admin-set email if the guest's own answer didn't include one:

```js
      if (guest.rsvp && (guest.rsvp.status === 'confirmed' || guest.rsvp.status === 'declined')) {
        state.submitted = true;
        state.rsvp = {
          name: guest.rsvp.name || '',
          email: guest.rsvp.email || guest.email || '',
```

- [ ] **Step 3: Manual verification**

Using an invite link for a guest with `email: "test@example.com"` set via the admin panel (Task 1) and no prior RSVP submission:
- Open `/?invite=<token>` → the RSVP form's email field is prefilled with `test@example.com`, and remains editable (change it, the change sticks in the field as normal).
- Submit the RSVP with a different email → reload the page → the form now shows the *submitted* email, not the admin one (guest's own answer wins).
- Test a guest with no `email` field at all and no prior RSVP → email field starts empty, as before this change (no regression).
- Open the browser console throughout — no errors.

- [ ] **Step 4: Commit**

```bash
rtk git add script.js
rtk git commit -m "$(cat <<'EOF'
feat: prefill public RSVP email from admin-set guest.email

Falls back to the guest's own previously-submitted rsvp.email when
present, so it's never overwritten by the admin-set default.
EOF
)"
```

---

### Task 3: Admin — event/status filters and Événements column removal

**Files:**
- Modify: `admin/guests.js`
- Modify: `admin/styles.css`

**Interfaces:**
- Produces: `renderGuestRow(g, editable)` — signature changed (drops the `eventById` parameter it no longer needs). Task 4 must call it with this new 2-argument signature.
- Consumes: nothing new from other tasks. Independent of Tasks 1/2.

- [ ] **Step 1: Add module-level filter state and a status-filter list**

In `admin/guests.js`, add this right after `const guestsCol = collection(db, 'guests');` (currently line 10):

```js
let statusFilter = 'all';
let eventFilters = new Set();

const STATUS_FILTERS = [['all', 'Tous'], ['confirmed', 'Confirmés'], ['pending', 'En attente'], ['declined', 'Refusés']];
```

- [ ] **Step 2: Add a filter predicate and a filters-bar renderer**

In `admin/guests.js`, add this right after `formatMax` (currently ends at line 47):

```js
function guestStatus(g) {
  return g.rsvp?.status === 'confirmed' || g.rsvp?.status === 'declined' ? g.rsvp.status : 'pending';
}

function passesFilters(g) {
  if (statusFilter !== 'all' && guestStatus(g) !== statusFilter) return false;
  if (eventFilters.size > 0) {
    const assigned = g.assignedEvents || [];
    if (!assigned.some(id => eventFilters.has(id))) return false;
  }
  return true;
}

function renderGuestFilters(events) {
  return `
    <div class="guest-filters">
      <div class="filter-group">
        <button class="filter-pill ${eventFilters.size === 0 ? 'filter-pill-active' : ''}" data-event-filter="__all__">Tous les événements</button>
        ${events.map(e => `<button class="filter-pill ${eventFilters.has(e.id) ? 'filter-pill-active' : ''}" data-event-filter="${escapeHtml(e.id)}">${escapeHtml(e.title_fr)}</button>`).join('')}
      </div>
      <div class="filter-group">
        ${STATUS_FILTERS.map(([id, label]) => `<button class="filter-pill ${statusFilter === id ? 'filter-pill-active' : ''}" data-status-filter="${id}">${label}</button>`).join('')}
      </div>
    </div>`;
}
```

- [ ] **Step 3: Drop the Événements cell from `renderGuestRow` and simplify its signature**

In `admin/guests.js`, replace `renderGuestRow` (currently lines 54-90):

```js
function renderGuestRow(g, editable) {
  const side = g.side || 'deux';
  const rsvp = g.rsvp || {};
  const STATUS_LABELS = { confirmed: 'Confirmé', declined: 'Décliné', pending: 'En attente' };
  const STATUS_BADGE = { confirmed: 'badge-confirmed', declined: 'badge-declined', pending: 'badge-pending' };
  const status = rsvp.status || 'pending';
  const statusLabel = STATUS_LABELS[status] || STATUS_LABELS.pending;
  const statusClass = STATUS_BADGE[status] || STATUS_BADGE.pending;
  const actionsCell = editable
    ? `<div class="table-actions">
         <button class="btn-secondary btn-view-rsvp" data-id="${escapeHtml(g.id)}">Réponse</button>
         <button class="btn-secondary btn-edit-guest" data-id="${escapeHtml(g.id)}">Modifier</button>
         <button class="btn-danger btn-delete-guest" data-id="${escapeHtml(g.id)}">Supprimer</button>
       </div>`
    : `<div class="table-actions">
         <button class="btn-secondary btn-view-rsvp" data-id="${escapeHtml(g.id)}">Réponse</button>
       </div>`;
  return `
    <tr class="guest-row" data-id="${escapeHtml(g.id)}">
      <td>${escapeHtml(g.name)}</td>
      <td><span class="badge ${SIDE_BADGE[side]}">${SIDE_LABELS[side]}</span></td>
      <td>${formatMax(g)}</td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>${rsvp.adults ?? ''}</td>
      <td>${rsvp.children ?? ''}</td>
      <td>
        <button class="btn-icon btn-copy-link" data-token="${escapeHtml(g.id)}" title="Copier le lien">${LINK_ICON}</button>
      </td>
      <td>${actionsCell}</td>
    </tr>`;
}
```

This is the same row as before, minus the `eventById`/`pills` computation and the Événements `<td>`. The `actionsCell` here is unchanged from before — Task 4 replaces it with the ⋮ menu; don't build the menu in this task.

- [ ] **Step 4: Wire filters + filtered rows into `renderGuestsTab`, update the table header/colspan**

In `admin/guests.js`, replace `renderGuestsTab` (currently lines 151-205):

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
  const filteredGuests = guests.filter(passesFilters);

  panel.innerHTML = `
    ${renderGuestFilters(events)}
    <table class="admin-table">
      <thead>
        <tr>
          <th>Nom</th><th>Côté</th><th>Max</th><th>RSVP</th>
          <th>Adultes</th><th>Enfants</th><th>Lien</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filteredGuests.length
          ? filteredGuests.map(g => renderGuestRow(g, editable)).join('')
          : '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:40px">Aucun invité.</td></tr>'}
      </tbody>
    </table>`;

  panel.querySelectorAll('[data-event-filter]').forEach(btn =>
    btn.addEventListener('click', () => {
      const val = btn.dataset.eventFilter;
      if (val === '__all__') eventFilters.clear();
      else if (eventFilters.has(val)) eventFilters.delete(val);
      else eventFilters.add(val);
      renderGuestsTab();
    })
  );
  panel.querySelectorAll('[data-status-filter]').forEach(btn =>
    btn.addEventListener('click', () => { statusFilter = btn.dataset.statusFilter; renderGuestsTab(); })
  );

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

Note: `.btn-view-rsvp`/`.btn-edit-guest`/`.btn-delete-guest` listener wiring is unchanged from before this task — Task 4 will replace this whole block with the menu-based wiring. Don't build the menu here; this task only removes the Événements column and adds filtering.

- [ ] **Step 5: Add CSS for the filter bar**

Append to `admin/styles.css`:

```css
.guest-filters{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
.guest-filters .filter-group{display:flex;gap:8px;flex-wrap:wrap}
```

(`.filter-pill`/`.filter-pill-active` already exist in `admin/styles.css` from the vendors filter — reused as-is, no redefinition needed.)

- [ ] **Step 6: Manual verification**

With an admin user that has `write` on `guests`, and at least 2 events and a handful of guests with mixed RSVP statuses and event assignments:
- Open Invités → filter bar appears above the table: an event-pills row (starting with "Tous les événements", active by default) and a status-pills row (Tous/Confirmés/En attente/Refusés, "Tous" active by default). Table has no "Événements" column anymore (8 columns: Nom, Côté, Max, RSVP, Adultes, Enfants, Lien, Actions).
- Click a status pill (e.g. "Confirmés") → table shows only confirmed guests; click "Tous" → back to everyone.
- Click one event pill → table shows only guests assigned to that event, "Tous les événements" pill deactivates. Click a second event pill → table now shows guests assigned to *either* selected event (OR). Click "Tous les événements" → both event pills deactivate, full list returns.
- Combine an event pill + a status pill → table shows only guests matching both (AND).
- Navigate to another tab and back to Invités → filter selection is preserved (module-level state, not reset by tab switch). Reload the page (F5) → filters reset to "Tous"/"Tous les événements".
- Existing actions (Réponse/Modifier/Supprimer/Copier le lien) still work exactly as before — this task didn't touch them.
- Switch to a `read`-only user on `guests` → filters still work (filtering isn't gated), no "+ Ajouter"/Modifier/Supprimer.
- Open the browser console throughout — no errors.

- [ ] **Step 7: Commit**

```bash
rtk git add admin/guests.js admin/styles.css
rtk git commit -m "$(cat <<'EOF'
feat: add event/status filters to guests table, drop Événements column

Multi-select event filter (OR) + single-select RSVP status filter
(AND'd together), following the existing admin/vendors.js filter
pattern. Row-level event pills removed to declutter the table; the
assignment is still visible in the edit and RSVP-detail panels.
EOF
)"
```

---

### Task 4: Admin — collapse row actions into a ⋮ menu

**Files:**
- Modify: `admin/guests.js`
- Modify: `admin/styles.css`

**Interfaces:**
- Consumes: `renderGuestRow(g, editable)` (Task 3's signature).
- Produces: nothing consumed later — last task in this plan.

- [ ] **Step 1: Add a menu-close listener registered once, and a `renderActionsCell` helper**

In `admin/guests.js`, add this right after `renderGuestFilters` (added in Task 3, Step 2):

```js
let menuCloseListenerAttached = false;
function ensureMenuCloseListener() {
  if (menuCloseListenerAttached) return;
  document.addEventListener('click', () => {
    document.querySelectorAll('.action-menu:not([hidden])').forEach(m => { m.hidden = true; });
  });
  menuCloseListenerAttached = true;
}

function renderActionsCell(g, editable) {
  const items = editable
    ? [
        { action: 'view-rsvp', label: 'Réponse' },
        { action: 'edit-guest', label: 'Modifier' },
        { action: 'delete-guest', label: 'Supprimer', danger: true },
      ]
    : [{ action: 'view-rsvp', label: 'Réponse' }];
  return `
    <div class="action-menu-wrap">
      <button type="button" class="btn-icon action-menu-btn" data-id="${escapeHtml(g.id)}">⋮</button>
      <div class="action-menu" hidden>
        ${items.map(it => `<button type="button" class="action-menu-item ${it.danger ? 'action-menu-item-danger' : ''}" data-action="${it.action}" data-id="${escapeHtml(g.id)}">${it.label}</button>`).join('')}
      </div>
    </div>`;
}
```

- [ ] **Step 2: Use `renderActionsCell` in `renderGuestRow`, dropping the inline `actionsCell`**

In `admin/guests.js`, `renderGuestRow` (Task 3's version) currently builds `actionsCell` inline and uses it in the last `<td>`. Replace the whole function:

```js
function renderGuestRow(g, editable) {
  const side = g.side || 'deux';
  const rsvp = g.rsvp || {};
  const STATUS_LABELS = { confirmed: 'Confirmé', declined: 'Décliné', pending: 'En attente' };
  const STATUS_BADGE = { confirmed: 'badge-confirmed', declined: 'badge-declined', pending: 'badge-pending' };
  const status = rsvp.status || 'pending';
  const statusLabel = STATUS_LABELS[status] || STATUS_LABELS.pending;
  const statusClass = STATUS_BADGE[status] || STATUS_BADGE.pending;
  return `
    <tr class="guest-row" data-id="${escapeHtml(g.id)}">
      <td>${escapeHtml(g.name)}</td>
      <td><span class="badge ${SIDE_BADGE[side]}">${SIDE_LABELS[side]}</span></td>
      <td>${formatMax(g)}</td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>${rsvp.adults ?? ''}</td>
      <td>${rsvp.children ?? ''}</td>
      <td>
        <button class="btn-icon btn-copy-link" data-token="${escapeHtml(g.id)}" title="Copier le lien">${LINK_ICON}</button>
      </td>
      <td>${renderActionsCell(g, editable)}</td>
    </tr>`;
}
```

- [ ] **Step 3: Replace the action-button wiring in `renderGuestsTab` with menu-toggle + delegated action handling**

In `admin/guests.js`, `renderGuestsTab` (Task 3's version) has this block after the table is inserted (filter listeners, then the `if (editable) { ... }` block, then `.btn-view-rsvp`/`.btn-copy-link` listeners). Replace everything from `if (editable) {` through the `.btn-view-rsvp` listener block (i.e. keep the filter-pill listeners and the final `.btn-copy-link` listener untouched, replace only the middle section) with:

```js
  ensureMenuCloseListener();
  panel.querySelectorAll('.action-menu-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const menu = btn.nextElementSibling;
      const wasOpen = !menu.hidden;
      document.querySelectorAll('.action-menu').forEach(m => { m.hidden = true; });
      menu.hidden = wasOpen;
    });
  });
  panel.querySelectorAll('.action-menu-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const guestId = btn.dataset.id;
      btn.closest('.action-menu').hidden = true;
      if (action === 'view-rsvp') {
        openRsvpDetail(guests.find(g => g.id === guestId), eventById);
      } else if (action === 'edit-guest') {
        openGuestPanel(guestId, guests, events, childrenAllowed);
      } else if (action === 'delete-guest') {
        if (!confirm('Supprimer cet invité ?')) return;
        await deleteDoc(doc(db, 'guests', guestId));
        renderGuestsTab();
      }
    });
  });
  if (editable) {
    document.getElementById('add-guest-btn').addEventListener('click', () =>
      openGuestPanel(null, guests, events, childrenAllowed)
    );
  }
```

The full `renderGuestsTab` body, in order, is now: loading placeholder → `editable`/`section-action` header button → data fetch → `panel.innerHTML` (filters + table) → event-filter-pill listeners → status-filter-pill listeners → the block above (menu wiring, replacing the old `.btn-edit-guest`/`.btn-delete-guest`/`.btn-view-rsvp` listeners) → the existing `.btn-copy-link` listener block, unchanged. Read the current file after Task 3 lands to confirm exact placement before editing — don't guess at line numbers, locate the blocks by the code shown here and in Task 3.

- [ ] **Step 4: Add CSS for the action menu**

Append to `admin/styles.css`:

```css
.action-menu-wrap{position:relative;display:inline-block}
.action-menu-btn{font-size:18px;line-height:1;padding:4px 10px}
.action-menu{position:absolute;right:0;top:100%;z-index:20;background:#fff;border:1px solid var(--border);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.12);min-width:140px;display:flex;flex-direction:column;padding:4px;margin-top:4px}
.action-menu-item{background:none;border:none;text-align:left;padding:8px 10px;border-radius:4px;cursor:pointer;font-size:13px;color:var(--text)}
.action-menu-item:hover{background:#f3f4f6}
.action-menu-item-danger{color:var(--danger)}
```

If `var(--text)` isn't already defined in `admin/styles.css` (check the `:root` block at the top of the file first), drop that property from `.action-menu-item` rather than inventing a new variable — the button will inherit the page's default text color, which is correct here.

- [ ] **Step 5: Manual verification**

With an admin user that has `write` on `guests`:
- Open Invités → Actions column shows a single "⋮" button per row, no more inline Réponse/Modifier/Supprimer buttons.
- Click "⋮" on one row → menu opens showing Réponse/Modifier/Supprimer. Click "⋮" on a different row → first menu closes, second opens (only one open at a time).
- Click elsewhere on the page (not on any menu) → open menu closes.
- Click "Réponse" in the menu → RSVP detail panel opens (same as before), menu closes.
- Click "Modifier" → edit panel opens, menu closes.
- Click "Supprimer" → confirm dialog appears; cancel → nothing happens, menu already closed; confirm → guest deleted, table re-renders.
- Switch to a `read`-only user on `guests` → "⋮" menu shows only "Réponse".
- "Copier le lien" icon button (outside the menu) still works exactly as before.
- Open the browser console throughout — no errors.

- [ ] **Step 6: Commit**

```bash
rtk git add admin/guests.js admin/styles.css
rtk git commit -m "$(cat <<'EOF'
feat: collapse guest row actions into a ⋮ menu

Réponse/Modifier/Supprimer move into a per-row dropdown, closing on
outside click or after an action; Copier le lien stays a standalone
icon button since it's a frequent, non-destructive action.
EOF
)"
```
