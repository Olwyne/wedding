# Onglets To-Do & Calendrier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two linked admin tabs — "To-Do" (task list) and "Calendrier" (month view of tasks with a due date) — backed by a single new `tasks` Firestore collection, with independent read/write permissions per tab and a shared task edit panel.

**Architecture:** Two new tab modules (`admin/todo.js`, `admin/calendar.js`) follow the existing per-section pattern (`export async function renderXTab()` owning its `#tab-X` subtree), registered through `admin/sections-registry.js` for automatic nav/routing/permissions wiring. A shared `admin/tasks-shared.js` module owns the Firestore access and the create/edit side panel, used by both tabs to avoid duplicating the panel markup. The calendar view uses FullCalendar (loaded from CDN on first visit to the tab) — the project's first external UI dependency, decided during design over a custom month grid.

**Tech Stack:** Vanilla JS (ES modules), Firebase Firestore v10 modular SDK, no build step, no test framework (project has none — verification is manual in-browser). FullCalendar 6.x loaded from `cdn.jsdelivr.net`.

## Global Constraints

- New Firestore collection `tasks`: `{ title, description, status: 'todo'|'in_progress'|'done', dueDate: 'YYYY-MM-DD'|null, linkedType: 'none'|'guest'|'vendor', linkedId, assignedTo, order, createdAt }`.
- Two separate permission keys, `todo` and `calendar`, both pointing at the `tasks` collection — independent read/write per user.
- Calendar tab only shows tasks where `dueDate` is non-null; To-Do tab shows all tasks.
- Both tabs share the same create/edit panel (`openTaskPanel` from `admin/tasks-shared.js`).
- Calendar `write` permission enables day-click-to-create and drag-to-reschedule; without it the tab is read-only (no day click, no drag, panel opens disabled).
- Follow existing code style: `escapeHtml` on all interpolated user text, `canRead`/`canWrite` gating from `admin/permissions.js`, direct Firestore calls per module (no extra abstraction layers beyond what's specified here).

---

### Task 1: Register both sections, wire nav/routing/rules, stub panels

**Files:**
- Modify: `admin/sections-registry.js`
- Modify: `admin/index.html:60-65` (nav buttons), `admin/index.html:85-86` (tab panels)
- Modify: `admin/script.js`
- Modify: `firestore.rules`
- Create: `admin/todo.js` (stub)
- Create: `admin/calendar.js` (stub)

**Interfaces:**
- Produces: `renderTodoTab()`, `renderCalendarTab()` — async functions, no args, populate `#tab-todo` / `#tab-calendar` respectively. (Stub bodies here; full implementations in Tasks 3 and 4.)

- [ ] **Step 1: Add both sections to the registry**

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
  { id: 'todo', label: 'To-Do', collection: 'tasks' },
  { id: 'calendar', label: 'Calendrier', collection: 'tasks' },
  { id: 'users', label: 'Utilisateurs', collection: 'admins' },
];
```

- [ ] **Step 2: Add nav buttons and tab panels to the HTML**

In `admin/index.html`, insert these two nav items right after the "Événements" `nav-item` block (after line 62's closing `</button>`, before the "Utilisateurs" button):

```html
      <button class="nav-item" data-section="todo" hidden>
        <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></span> To-Do
      </button>
      <button class="nav-item" data-section="calendar" hidden>
        <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg></span> Calendrier
      </button>
```

And insert these two tab panels right after `<div id="tab-events" class="tab-panel" hidden></div>` (line 85), before `<div id="tab-users" ...>`:

```html
      <div id="tab-todo" class="tab-panel" hidden></div>
      <div id="tab-calendar" class="tab-panel" hidden></div>
```

- [ ] **Step 3: Create the stub modules**

Create `admin/todo.js`:

```js
// admin/todo.js
import { canWrite } from './permissions.js';

export async function renderTodoTab() {
  const panel = document.getElementById('tab-todo');
  document.getElementById('section-action').innerHTML = '';
  const editable = canWrite('todo');
  panel.innerHTML = `<p style="padding:20px;color:var(--muted)">To-Do — à venir (editable: ${editable})</p>`;
}
```

Create `admin/calendar.js`:

```js
// admin/calendar.js
import { canWrite } from './permissions.js';

export async function renderCalendarTab() {
  const panel = document.getElementById('tab-calendar');
  document.getElementById('section-action').innerHTML = '';
  const editable = canWrite('calendar');
  panel.innerHTML = `<p style="padding:20px;color:var(--muted)">Calendrier — à venir (editable: ${editable})</p>`;
}
```

- [ ] **Step 4: Wire both into script.js**

Edit `admin/script.js`. Add imports after the `renderEventsTab` import:

```js
import { renderTodoTab } from './todo.js?v=1';
import { renderCalendarTab } from './calendar.js?v=1';
```

Add to `RENDER_BY_ID` (after `events: renderEventsTab,`):

```js
  todo: renderTodoTab,
  calendar: renderCalendarTab,
```

Update `SLUG_BY_SECTION`:

```js
const SLUG_BY_SECTION = { dashboard: 'dashboard', blocks: 'content', vendors: 'vendors', budget: 'budget', guests: 'guest', tables: 'tables', witnesses: 'witnesses', events: 'events', todo: 'todo', calendar: 'calendar', users: 'users' };
```

- [ ] **Step 5: Update firestore.rules**

Add a new `tasks` match block in `firestore.rules`, right after the `tables` block (after line 39's closing `}`):

```
    match /tasks/{taskId} {
      allow read: if perm('todo') in ['read', 'write'] || perm('calendar') in ['read', 'write'];
      allow write: if perm('todo') == 'write' || perm('calendar') == 'write';
    }
```

The task edit panel (built in Task 2) lets a user link a task to a guest or vendor, and assign it to an admin — which means `todo`/`calendar` users need read access to `guests`, `vendors`, and `admins` even without permission on those sections directly. Extend the existing rules the same way `tables`/`witnesses` already extend the `guests` list rule:

In the `guests` block, change:
```
      allow list: if perm('guests') in ['read', 'write'] || perm('witnesses') in ['read', 'write'] || perm('tables') in ['read', 'write'];
```
to:
```
      allow list: if perm('guests') in ['read', 'write'] || perm('witnesses') in ['read', 'write'] || perm('tables') in ['read', 'write'] || perm('todo') in ['read', 'write'] || perm('calendar') in ['read', 'write'];
```

In the `vendors` block, change:
```
      allow read: if perm('vendors') in ['read', 'write'] || perm('budget') in ['read', 'write'];
```
to:
```
      allow read: if perm('vendors') in ['read', 'write'] || perm('budget') in ['read', 'write'] || perm('todo') in ['read', 'write'] || perm('calendar') in ['read', 'write'];
```

In the `admins` block, change:
```
      allow get, list: if perm('users') in ['read', 'write'];
```
to:
```
      allow get, list: if perm('users') in ['read', 'write'] || perm('todo') in ['read', 'write'] || perm('calendar') in ['read', 'write'];
```

This means a user with `todo` or `calendar` read/write can list admin emails (needed to populate the "Assigné à" dropdown) even without `users` permission — a deliberate scope extension required for the assignment picker to work, mirroring how `tables`/`witnesses` already extend guest-list access.

Deploy the updated rules:

```bash
firebase deploy --only firestore:rules
```

- [ ] **Step 6: Manual verification**

Open the admin locally (through your existing local Firebase-hosting preview flow, or `preview_start` on the project's dev command). Log in, confirm:
- "To-Do" and "Calendrier" appear in the sidebar between "Événements" and "Utilisateurs" — only if your logged-in admin has `read`+ on `todo`/`calendar` (brand new permission keys default to `none`; use the Utilisateurs tab, or set `permissions.todo = 'write'` and `permissions.calendar = 'write'` on your own admin doc in the Firestore console).
- Clicking each shows the stub text, URL becomes `/admin/todo/` and `/admin/calendar/` respectively.
- Reloading either URL directly lands back on the right tab.
- In the Firestore console, confirm the rules deployed (Rules tab shows the new `tasks` match block and the three extended `list`/`read` lines).

- [ ] **Step 7: Commit**

```bash
git add admin/sections-registry.js admin/index.html admin/script.js admin/todo.js admin/calendar.js firestore.rules
git commit -m "feat: register To-Do and Calendrier admin sections with stub panels"
```

---

### Task 2: Shared task data layer and edit panel

**Files:**
- Modify: `admin/users.js:34` (export `loadUsers`)
- Create: `admin/tasks-shared.js`

**Interfaces:**
- Consumes: `loadGuests()` from `admin/guests.js` (existing, returns `Array<{id, name, ...}>`), `loadVendors()` from `admin/vendors.js` (existing, returns `Array<{id, name, ...}>`), `loadUsers()` from `admin/users.js` (newly exported this task, returns `Array<{id, email, permissions}>`).
- Produces: `loadTasks()` — async, returns `Array<{id, title, description, status, dueDate, linkedType, linkedId, assignedTo, order, createdAt}>`, ordered by `order`. `STATUS_LABELS` — `{ todo: 'À faire', in_progress: 'En cours', done: 'Terminé' }`. `escapeHtml(str)` — same utility as other modules. `openTaskPanel(id, tasks, { onSaved, defaults, readOnly } = {})` — opens the side panel; `id` null for create, existing task id for edit; `tasks` is the already-loaded array (for `id` lookup and `order` on create); `onSaved` called after a successful save; `defaults` pre-fills fields on create (e.g. `{ dueDate: '2026-09-01' }`); `readOnly` disables all fields and hides the save button.

- [ ] **Step 1: Export loadUsers from users.js**

In `admin/users.js`, change line 34 from:

```js
async function loadUsers() {
```

to:

```js
export async function loadUsers() {
```

- [ ] **Step 2: Create tasks-shared.js**

Create `admin/tasks-shared.js`:

```js
// admin/tasks-shared.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc,
  query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadGuests } from './guests.js?v=5';
import { loadVendors } from './vendors.js?v=6';
import { loadUsers } from './users.js?v=1';

const tasksCol = collection(db, 'tasks');

export const STATUS_LABELS = { todo: 'À faire', in_progress: 'En cours', done: 'Terminé' };

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export async function loadTasks() {
  const snap = await getDocs(query(tasksCol, orderBy('order')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function openTaskPanel(id, tasks, { onSaved, defaults = {}, readOnly = false } = {}) {
  const task = id ? tasks.find(t => t.id === id) : null;
  const isNew = !task;
  const v = (key, fallback = '') => task?.[key] ?? defaults[key] ?? fallback;
  const dis = readOnly ? 'disabled' : '';

  return Promise.all([loadGuests(), loadVendors(), loadUsers()]).then(([guests, vendors, admins]) => {
    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    const panelEl = document.createElement('div');
    panelEl.className = 'panel';

    const linkOptionsFor = (type, selectedId) => {
      if (type === 'guest') return guests.map(g => `<option value="${escapeHtml(g.id)}" ${selectedId === g.id ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
      if (type === 'vendor') return vendors.map(ve => `<option value="${escapeHtml(ve.id)}" ${selectedId === ve.id ? 'selected' : ''}>${escapeHtml(ve.name)}</option>`).join('');
      return '';
    };

    const linkedType = v('linkedType', 'none');
    const linkedId = v('linkedId', '');

    panelEl.innerHTML = `
      <div class="panel-header">
        <h3>${isNew ? 'Nouvelle tâche' : (readOnly ? 'Tâche' : 'Modifier la tâche')}</h3>
        <button class="btn-icon" id="panel-close">✕</button>
      </div>
      <div class="panel-body">
        <label class="field"><span>Titre</span><input id="task-title" value="${escapeHtml(v('title'))}" ${dis} required></label>
        <label class="field"><span>Description</span><textarea id="task-desc" ${dis}>${escapeHtml(v('description'))}</textarea></label>
        <label class="field"><span>Statut</span>
          <select id="task-status" ${dis}>
            ${Object.entries(STATUS_LABELS).map(([val, label]) => `<option value="${val}" ${v('status', 'todo') === val ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>Échéance</span><input id="task-due" type="date" value="${escapeHtml(v('dueDate', ''))}" ${dis}></label>
        <label class="field"><span>Lié à</span>
          <select id="task-linked-type" ${dis}>
            <option value="none" ${linkedType === 'none' ? 'selected' : ''}>Aucun</option>
            <option value="guest" ${linkedType === 'guest' ? 'selected' : ''}>Invité</option>
            <option value="vendor" ${linkedType === 'vendor' ? 'selected' : ''}>Prestataire</option>
          </select>
        </label>
        <label class="field" id="task-linked-id-field" ${linkedType === 'none' ? 'hidden' : ''}>
          <span>Choisir</span>
          <select id="task-linked-id" ${dis}>${linkOptionsFor(linkedType, linkedId)}</select>
        </label>
        <label class="field"><span>Assigné à</span>
          <select id="task-assigned" ${dis}>
            <option value="">Personne</option>
            ${admins.map(a => `<option value="${escapeHtml(a.id)}" ${v('assignedTo') === a.id ? 'selected' : ''}>${escapeHtml(a.email)}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="panel-footer">
        ${readOnly
          ? '<button class="btn-secondary" id="panel-cancel">Fermer</button>'
          : `<button class="btn-primary" id="panel-save">${isNew ? 'Créer' : 'Enregistrer'}</button>
             <button class="btn-secondary" id="panel-cancel">Annuler</button>`}
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(panelEl);

    function close() { overlay.remove(); panelEl.remove(); }
    panelEl.querySelector('#panel-close').addEventListener('click', close);
    panelEl.querySelector('#panel-cancel').addEventListener('click', close);
    overlay.addEventListener('click', close);

    if (!readOnly) {
      panelEl.querySelector('#task-linked-type').addEventListener('change', (e) => {
        const type = e.target.value;
        panelEl.querySelector('#task-linked-id-field').hidden = type === 'none';
        panelEl.querySelector('#task-linked-id').innerHTML = linkOptionsFor(type, null);
      });

      panelEl.querySelector('#panel-save').addEventListener('click', async () => {
        const get = (sel) => panelEl.querySelector(sel).value;
        const title = get('#task-title').trim();
        if (!title) return;
        const linkedTypeVal = get('#task-linked-type');
        const data = {
          title,
          description: get('#task-desc'),
          status: get('#task-status'),
          dueDate: get('#task-due') || null,
          linkedType: linkedTypeVal,
          linkedId: linkedTypeVal === 'none' ? null : (get('#task-linked-id') || null),
          assignedTo: get('#task-assigned') || null,
        };
        if (id) {
          await updateDoc(doc(db, 'tasks', id), data);
        } else {
          await addDoc(tasksCol, { ...data, order: tasks.length + 1, createdAt: new Date().toISOString() });
        }
        close();
        if (onSaved) onSaved();
      });
    }
  });
}
```

- [ ] **Step 3: Manual verification**

This module has no UI of its own yet (no tab wired to call it) — verification happens end-to-end in Tasks 3 and 4. For now, confirm there are no import errors: open the admin, open the browser console, reload any tab, and confirm no "failed to fetch module" or syntax errors reference `tasks-shared.js` or the modified `users.js`.

- [ ] **Step 4: Commit**

```bash
git add admin/users.js admin/tasks-shared.js
git commit -m "feat: add shared task data layer and edit panel"
```

---

### Task 3: To-Do tab — list, filters, quick toggle, create/edit/delete

**Files:**
- Modify: `admin/todo.js` (full render logic, replaces stub)
- Modify: `admin/styles.css` (filter pills, status badges)

**Interfaces:**
- Consumes: `loadTasks()`, `escapeHtml()`, `STATUS_LABELS`, `openTaskPanel()` from `admin/tasks-shared.js` (Task 2). `loadGuests()` from `admin/guests.js`, `loadVendors()` from `admin/vendors.js`, `loadUsers()` from `admin/users.js`.
- Produces: `renderTodoTab()` (already declared in Task 1's stub; this task replaces the body). Nothing new consumed by later tasks.

- [ ] **Step 1: Replace todo.js with the full implementation**

Replace the entire contents of `admin/todo.js`:

```js
// admin/todo.js
import { db } from '../firebase-init.js';
import { doc, updateDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';
import { loadGuests } from './guests.js?v=5';
import { loadVendors } from './vendors.js?v=6';
import { loadUsers } from './users.js?v=1';
import { loadTasks, escapeHtml, STATUS_LABELS, openTaskPanel } from './tasks-shared.js?v=1';

let currentFilter = 'all';

const STATUS_BADGE = { todo: 'badge-status-todo', in_progress: 'badge-status-progress', done: 'badge-status-done' };

const FILTERS = [['all', 'Toutes'], ['todo', 'À faire'], ['in_progress', 'En cours'], ['done', 'Terminé']];

export async function renderTodoTab() {
  const panel = document.getElementById('tab-todo');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('todo');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-task-btn" class="btn-primary">+ Ajouter une tâche</button>'
    : '';

  const [tasks, guests, vendors, admins] = await Promise.all([
    loadTasks(), loadGuests(), loadVendors(), loadUsers()
  ]);
  const guestsById = new Map(guests.map(g => [g.id, g]));
  const vendorsById = new Map(vendors.map(v => [v.id, v]));
  const adminsById = new Map(admins.map(a => [a.id, a]));

  const linkedLabel = (t) => {
    if (t.linkedType === 'guest') return guestsById.get(t.linkedId)?.name || '—';
    if (t.linkedType === 'vendor') return vendorsById.get(t.linkedId)?.name || '—';
    return '—';
  };
  const assignedLabel = (t) => t.assignedTo ? (adminsById.get(t.assignedTo)?.email || '—') : '—';

  const filtered = currentFilter === 'all' ? tasks : tasks.filter(t => t.status === currentFilter);

  panel.innerHTML = `
    <div class="todo-filters">
      ${FILTERS.map(([id, label]) =>
        `<button class="pill ${currentFilter === id ? 'pill-active' : ''}" data-filter="${id}">${label}</button>`
      ).join('')}
    </div>
    <table class="admin-table">
      <thead>
        <tr><th></th><th>Titre</th><th>Statut</th><th>Échéance</th><th>Lié à</th><th>Assigné</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${filtered.length ? filtered.map(t => `
          <tr>
            <td><input type="checkbox" class="task-quick-done" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''} ${editable ? '' : 'disabled'}></td>
            <td>${escapeHtml(t.title)}</td>
            <td><span class="badge ${STATUS_BADGE[t.status] || ''}">${STATUS_LABELS[t.status] || t.status}</span></td>
            <td>${escapeHtml(t.dueDate || '—')}</td>
            <td>${escapeHtml(linkedLabel(t))}</td>
            <td>${escapeHtml(assignedLabel(t))}</td>
            <td>${editable
              ? `<div class="table-actions">
                   <button class="btn-secondary btn-edit-task" data-id="${t.id}">Modifier</button>
                   <button class="btn-danger btn-delete-task" data-id="${t.id}">Supprimer</button>
                 </div>`
              : ''}</td>
          </tr>`).join('')
          : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:40px">Aucune tâche.</td></tr>'}
      </tbody>
    </table>`;

  panel.querySelectorAll('[data-filter]').forEach(btn =>
    btn.addEventListener('click', () => { currentFilter = btn.dataset.filter; renderTodoTab(); })
  );

  if (editable) {
    document.getElementById('add-task-btn').addEventListener('click', () =>
      openTaskPanel(null, tasks, { onSaved: renderTodoTab })
    );
    panel.querySelectorAll('.btn-edit-task').forEach(btn =>
      btn.addEventListener('click', () => openTaskPanel(btn.dataset.id, tasks, { onSaved: renderTodoTab }))
    );
    panel.querySelectorAll('.btn-delete-task').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer cette tâche ?')) return;
        await deleteDoc(doc(db, 'tasks', btn.dataset.id));
        renderTodoTab();
      })
    );
    panel.querySelectorAll('.task-quick-done').forEach(cb =>
      cb.addEventListener('change', async () => {
        await updateDoc(doc(db, 'tasks', cb.dataset.id), { status: cb.checked ? 'done' : 'todo' });
        renderTodoTab();
      })
    );
  }
}
```

- [ ] **Step 2: Add filter pill and status badge CSS**

Append to `admin/styles.css`:

```css
.todo-filters{display:flex;gap:8px;margin-bottom:16px}
.pill{background:#fff;border:1px solid var(--border);color:var(--muted);border-radius:999px;padding:6px 14px;font-size:12.5px;font-weight:500;cursor:pointer}
.pill:hover{background:#f9fafb}
.pill-active{background:var(--accent);border-color:var(--accent);color:#fff}
.badge-status-todo{background:#f3f4f6;color:#374151}
.badge-status-progress{background:#fef3c7;color:#92400e}
.badge-status-done{background:#dcfce7;color:#15803d}
```

- [ ] **Step 3: Manual verification**

With an admin user that has `write` on `todo`:
- Click "+ Ajouter une tâche" → panel opens. Fill Titre "Relancer traiteur", leave rest default, save → row appears in table with status "À faire".
- Edit that task: set Échéance to a date, Lié à → Prestataire → pick one from the dropdown (populated from `vendors`), Assigné à → pick an admin, save → row updates, "Lié à" column shows the vendor name, "Assigné" shows the admin's email.
- Click the row's quick checkbox → status flips to "Terminé" immediately (no panel), badge updates, row's checkbox stays checked after re-render.
- Click filter pills "À faire" / "En cours" / "Terminé" → table filters accordingly; "Toutes" shows everything again.
- Click "Supprimer" on a task, confirm the browser confirm dialog → row disappears, confirm in Firestore console the doc is gone.
- Switch to a `read`-only user on `todo` (or remove write) → "+ Ajouter" button and row-level Modifier/Supprimer/checkbox all absent or disabled; table still shows data.

- [ ] **Step 4: Commit**

```bash
git add admin/todo.js admin/styles.css
git commit -m "feat: implement To-Do tab list, filters, and task CRUD"
```

---

### Task 4: Calendrier tab — FullCalendar month view, day-click create, drag reschedule

**Files:**
- Modify: `admin/calendar.js` (full render logic, replaces stub)
- Modify: `admin/styles.css` (calendar container styling)

**Interfaces:**
- Consumes: `loadTasks()`, `openTaskPanel()` from `admin/tasks-shared.js` (Task 2). Global `window.FullCalendar` (loaded dynamically from CDN).
- Produces: `renderCalendarTab()` (already declared in Task 1's stub; this task replaces the body). Last task — nothing consumed later.

- [ ] **Step 1: Replace calendar.js with the full implementation**

Replace the entire contents of `admin/calendar.js`:

```js
// admin/calendar.js
import { db } from '../firebase-init.js';
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';
import { loadTasks, openTaskPanel } from './tasks-shared.js?v=1';

const FC_SRC = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js';
const FC_LOCALES_SRC = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/locales-all.global.min.js';

const STATUS_COLOR = { todo: '#9ca3af', in_progress: '#f59e0b', done: '#16a34a' };

let calendarInstance = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Échec de chargement de ${src}`));
    document.head.appendChild(script);
  });
}

function loadFullCalendar() {
  if (window.FullCalendar) return Promise.resolve();
  if (!window.__fcLoadPromise) {
    window.__fcLoadPromise = loadScript(FC_SRC).then(() => loadScript(FC_LOCALES_SRC));
  }
  return window.__fcLoadPromise;
}

export async function renderCalendarTab() {
  const panel = document.getElementById('tab-calendar');
  document.getElementById('section-action').innerHTML = '';
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  try {
    await loadFullCalendar();
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${err.message}</p>`;
    return;
  }

  const editable = canWrite('calendar');
  const tasks = await loadTasks();
  const dueTasks = tasks.filter(t => t.dueDate);

  panel.innerHTML = '<div id="calendar-root"></div>';
  const root = document.getElementById('calendar-root');

  if (calendarInstance) {
    calendarInstance.destroy();
    calendarInstance = null;
  }

  calendarInstance = new window.FullCalendar.Calendar(root, {
    initialView: 'dayGridMonth',
    height: 'auto',
    locale: 'fr',
    firstDay: 1,
    editable,
    events: dueTasks.map(t => ({
      id: t.id,
      title: t.title,
      start: t.dueDate,
      allDay: true,
      color: STATUS_COLOR[t.status] || STATUS_COLOR.todo,
      textColor: '#fff',
    })),
    eventClick: (info) => {
      openTaskPanel(info.event.id, tasks, { onSaved: renderCalendarTab, readOnly: !editable });
    },
    dateClick: (info) => {
      if (!editable) return;
      openTaskPanel(null, tasks, { onSaved: renderCalendarTab, defaults: { dueDate: info.dateStr } });
    },
    eventDrop: async (info) => {
      await updateDoc(doc(db, 'tasks', info.event.id), { dueDate: info.event.startStr.slice(0, 10) });
    },
  });

  calendarInstance.render();
}
```

- [ ] **Step 2: Add calendar container CSS**

Append to `admin/styles.css`:

```css
#calendar-root{background:#fff;border:1px solid var(--border);border-radius:10px;padding:16px;font-family:inherit}
#calendar-root .fc-event{cursor:pointer;font-size:12px}
#calendar-root .fc-daygrid-day.fc-day-today{background:#eef2ff}
```

- [ ] **Step 3: Manual verification**

With an admin user that has `write` on `calendar` (and at least one task with a `dueDate` already created in Task 3's verification):
- Open the Calendrier tab → month grid renders in French (day/month names), the earlier task with a due date appears as a colored bar on that day, colored per its status (gray/orange/green).
- Click that event → the shared task panel opens pre-filled, matching what To-Do shows for the same task; edit the title, save → event label updates in the calendar.
- Click an empty day → panel opens with Échéance pre-filled to that date; fill Titre, save → new event appears on that day, and switching to the To-Do tab shows the same new task in the list.
- Drag an event to a different day → confirm the calendar updates immediately, and in the Firestore console the task's `dueDate` field reflects the new date. Reload the tab to confirm it persists.
- Switch to a `read`-only user on `calendar` (no write) → clicking an empty day does nothing, dragging an event is disabled (grabs but doesn't move / snaps back — FullCalendar's `editable: false` behavior), clicking an existing event opens the panel with all fields disabled and only a "Fermer" button.
- Open the browser console during all of the above — no errors from `fullcalendar` script loads or from `calendar.js`.

- [ ] **Step 4: Commit**

```bash
git add admin/calendar.js admin/styles.css
git commit -m "feat: implement Calendrier tab with FullCalendar month view"
```

---

## Post-plan note

`admin/users.js` already iterates `SECTIONS` from `sections-registry.js` for the permissions grid UI — no task needed there beyond Task 1's registry entries; `todo` and `calendar` appear automatically as two more permission rows for every admin user. Existing admins default to `none` on both (same as any brand-new section), so grant `read`/`write` explicitly via the Utilisateurs tab (or Firestore console) to whoever should see these tabs.
