# Checklist par étapes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Checklist" view inside the existing admin To-Do tab: a pre-seedable, milestone-grouped view of the same `tasks` collection, toggled against the current free-form list view.

**Architecture:** Extend the existing `admin/tasks-shared.js` (adds a `milestone` field to the shared task schema and edit panel) and rewrite `admin/todo.js` (adds a Liste libre / Checklist view toggle, milestone-grouped rendering, and a one-time seed button). No new Firestore collection, no new permission key, no changes to `admin/calendar.js` — calendar already renders any task with a `dueDate`, milestone or not.

**Tech Stack:** Vanilla JS (ES modules), Firebase Firestore v10 modular SDK, no build step, no test framework (project has none — verification is manual in-browser).

## Global Constraints

- `tasks` docs gain one new optional field: `milestone: '12plus' | '9-12' | '6-9' | '3-6' | '1-3' | 'week' | null`. `null`/absent = free task (unchanged behavior).
- Six fixed milestones, in this exact order and with these exact labels: `12plus` → "12+ mois avant", `9-12` → "9-12 mois avant", `6-9` → "6-9 mois avant", `3-6` → "3-6 mois avant", `1-3` → "1-3 mois avant", `week` → "Semaine du mariage". Hard-coded, not configurable.
- No new Firestore collection, no new permission key — stays under existing `todo`/`calendar` permissions and existing `firestore.rules` `tasks` block.
- Liste libre view = today's exact behavior (status-filter pills, table, all tasks). Checklist view = only tasks with non-null `milestone`, grouped by milestone in the fixed order, no status filter (checked/unchecked is the only state shown).
- Seed button ("Générer la checklist type") only visible when zero tasks currently have a non-null `milestone`, and only if `canWrite('todo')`. Creates exactly the 33 items listed in the spec (its "~30" is an approximation — the actual list is 33), `status: 'todo'`, `dueDate: null`, `linkedType: 'none'`, `linkedId: null`, `assignedTo: null`.
- Follow existing code style: `escapeHtml` on all interpolated user text, `canWrite('todo')` gating, direct Firestore calls, no extra abstraction layers beyond what's specified here.

---

### Task 1: Add `milestone` field to shared task schema and edit panel

**Files:**
- Modify: `admin/tasks-shared.js`
- Modify: `admin/calendar.js` (cache-bust version bump only)

**Interfaces:**
- Produces: `MILESTONES` — exported array of `[value, label]` pairs, exact order: `[['12plus','12+ mois avant'],['9-12','9-12 mois avant'],['6-9','6-9 mois avant'],['3-6','3-6 mois avant'],['1-3','1-3 mois avant'],['week','Semaine du mariage']]`. `openTaskPanel` (existing export, signature unchanged: `openTaskPanel(id, tasks, { onSaved, defaults, readOnly } = {})`) now also reads/writes `milestone` on the task doc.
- Consumes: nothing new.

- [ ] **Step 1: Add the `MILESTONES` export**

In `admin/tasks-shared.js`, add this export right after the existing `STATUS_LABELS` export (currently at line 13):

```js
export const MILESTONES = [
  ['12plus', '12+ mois avant'],
  ['9-12', '9-12 mois avant'],
  ['6-9', '6-9 mois avant'],
  ['3-6', '3-6 mois avant'],
  ['1-3', '1-3 mois avant'],
  ['week', 'Semaine du mariage'],
];
```

- [ ] **Step 2: Add the "Palier" field to the edit panel**

In `admin/tasks-shared.js`, inside `openTaskPanel`'s `panelEl.innerHTML` template, find this existing block (currently around line 56-60):

```js
        <label class="field"><span>Statut</span>
          <select id="task-status" ${dis}>
            ${Object.entries(STATUS_LABELS).map(([val, label]) => `<option value="${val}" ${v('status', 'todo') === val ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
```

Immediately after it (still before the `<label class="field"><span>Échéance</span>...` line), insert:

```js
        <label class="field"><span>Palier</span>
          <select id="task-milestone" ${dis}>
            <option value="none" ${!v('milestone') ? 'selected' : ''}>Aucun</option>
            ${MILESTONES.map(([val, label]) => `<option value="${val}" ${v('milestone') === val ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
```

- [ ] **Step 3: Save the field**

In `admin/tasks-shared.js`, inside the `#panel-save` click handler, find the `data` object construction (currently around line 326-334):

```js
        const data = {
          title,
          description: get('#task-desc'),
          status: get('#task-status'),
          dueDate: get('#task-due') || null,
          linkedType: linkedTypeVal,
          linkedId: linkedTypeVal === 'none' ? null : (get('#task-linked-id') || null),
          assignedTo: get('#task-assigned') || null,
        };
```

Add a `milestone` field to it:

```js
        const data = {
          title,
          description: get('#task-desc'),
          status: get('#task-status'),
          dueDate: get('#task-due') || null,
          linkedType: linkedTypeVal,
          linkedId: linkedTypeVal === 'none' ? null : (get('#task-linked-id') || null),
          assignedTo: get('#task-assigned') || null,
          milestone: get('#task-milestone') === 'none' ? null : get('#task-milestone'),
        };
```

- [ ] **Step 4: Bump the cache-bust version on both importers of `tasks-shared.js`**

`admin/tasks-shared.js` changed in this task, and it's imported from two places: `admin/todo.js` and `admin/calendar.js`, both currently as `'./tasks-shared.js?v=1'`. This project's only cache-busting mechanism is manually incrementing these `?v=N` suffixes whenever the imported file changes (every commit that edits `script.js`/`styles.css`/a shared module bumps its importers' version — see e.g. commit `21a326f`). Task 2 already rewrites `admin/todo.js` from scratch with `'./tasks-shared.js?v=2'` baked in, so it doesn't need a separate edit here. But `admin/calendar.js` is NOT touched by any other task in this plan, so bump it now:

In `admin/calendar.js`, change:

```js
import { loadTasks, openTaskPanel } from './tasks-shared.js?v=1';
```

to:

```js
import { loadTasks, openTaskPanel } from './tasks-shared.js?v=2';
```

- [ ] **Step 5: Manual verification**

There's no UI yet calling this changed panel with a visible "Palier" field consumer beyond the existing To-Do tab (Task 2 wires the Checklist view). For now: open the admin, open the To-Do tab, click "+ Ajouter une tâche" (or "Modifier" on an existing task) — confirm a new "Palier" select appears between "Statut" and "Échéance", defaulting to "Aucun", with the six milestone options listed in order. Pick one, save, then re-open the same task's edit panel — confirm the milestone you picked is still selected (not reset to "Aucun"). Open the Calendrier tab too (unaffected by Task 2, still on the old code path until this step's bump lands) and confirm it still loads without console errors — this only proves the bumped import resolves correctly, not any new Calendrier behavior (that's out of scope, see Task 2's post-plan note). Open the browser console throughout — no errors.

- [ ] **Step 6: Commit**

```bash
git add admin/tasks-shared.js admin/calendar.js
git commit -m "feat: add milestone field to shared task schema and edit panel"
```

---

### Task 2: Checklist view toggle, grouped rendering, and default seed

**Files:**
- Modify: `admin/todo.js` (full rewrite)
- Modify: `admin/styles.css` (checklist group/item styles, view-toggle pills)
- Modify: `admin/script.js` (cache-bust version bump only)

**Interfaces:**
- Consumes: `MILESTONES`, `loadTasks`, `escapeHtml`, `STATUS_LABELS`, `openTaskPanel` from `admin/tasks-shared.js` (Task 1). `loadGuests()` from `admin/guests.js`, `loadVendors()` from `admin/vendors.js`, `loadUsers()` from `admin/users.js`. `canWrite` from `admin/permissions.js`. Firestore `db`, `doc`, `updateDoc`, `deleteDoc`, `addDoc`, `collection` from the modular SDK.
- Produces: `renderTodoTab()` (existing export, same signature — this task replaces its body and the module's internal structure). Last task — nothing consumed later.

- [ ] **Step 1: Replace `admin/todo.js` with the full implementation**

Replace the entire contents of `admin/todo.js`:

```js
// admin/todo.js
import { db } from '../firebase-init.js';
import { collection, doc, addDoc, updateDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';
import { loadGuests } from './guests.js?v=5';
import { loadVendors } from './vendors.js?v=6';
import { loadUsers } from './users.js?v=1';
import { loadTasks, escapeHtml, STATUS_LABELS, MILESTONES, openTaskPanel } from './tasks-shared.js?v=2';

const tasksCol = collection(db, 'tasks');

let currentView = 'free';
let currentFilter = 'all';

const STATUS_BADGE = { todo: 'badge-status-todo', in_progress: 'badge-status-progress', done: 'badge-status-done' };

const FILTERS = [['all', 'Toutes'], ['todo', 'À faire'], ['in_progress', 'En cours'], ['done', 'Terminé']];

const CHECKLIST_SEED = [
  ['12plus', 'Définir le budget global'],
  ['12plus', 'Établir la liste des invités provisoire'],
  ['12plus', 'Choisir la date du mariage'],
  ['12plus', 'Réserver le lieu de réception'],
  ['12plus', 'Réserver le lieu de cérémonie (si différent)'],
  ['9-12', 'Réserver le traiteur'],
  ['9-12', 'Réserver le photographe'],
  ['9-12', 'Réserver le vidéaste'],
  ['9-12', 'Réserver la musique / DJ'],
  ['9-12', 'Choisir les témoins'],
  ['6-9', 'Choisir et commander la robe de mariée'],
  ['6-9', 'Choisir les costumes'],
  ['6-9', 'Réserver le fleuriste'],
  ['6-9', "Réserver l'officiant / la cérémonie"],
  ['6-9', 'Envoyer les save-the-date'],
  ['6-9', "Réserver l'hébergement pour les invités"],
  ['3-6', 'Envoyer les invitations'],
  ['3-6', 'Choisir le gâteau'],
  ['3-6', 'Réserver les transports'],
  ['3-6', 'Choisir les alliances'],
  ['3-6', 'Planifier la lune de miel'],
  ['3-6', 'Essayage robe/costume'],
  ['1-3', 'Confirmer le nombre définitif d’invités (RSVP)'],
  ['1-3', 'Finaliser le plan de table'],
  ['1-3', 'Essayage final robe/costume'],
  ['1-3', 'Confirmer les prestataires (horaires, livraisons)'],
  ['1-3', 'Préparer le déroulé jour-J'],
  ['1-3', 'Récupérer les alliances'],
  ['week', 'Confirmer les derniers détails avec chaque prestataire'],
  ['week', 'Préparer les paiements finaux (soldes)'],
  ['week', "Préparer le kit d'urgence (couture, épingles...)"],
  ['week', 'Répéter la cérémonie'],
  ['week', 'Se reposer !'],
];

async function seedChecklist(tasks) {
  let order = tasks.length + 1;
  for (const [milestone, title] of CHECKLIST_SEED) {
    await addDoc(tasksCol, {
      title,
      description: '',
      status: 'todo',
      dueDate: null,
      linkedType: 'none',
      linkedId: null,
      assignedTo: null,
      milestone,
      order: order++,
      createdAt: new Date().toISOString(),
    });
  }
}

function renderFreeView(tasks, guestsById, vendorsById, adminsById, editable) {
  const linkedLabel = (t) => {
    if (t.linkedType === 'guest') return guestsById.get(t.linkedId)?.name || '—';
    if (t.linkedType === 'vendor') return vendorsById.get(t.linkedId)?.name || '—';
    return '—';
  };
  const assignedLabel = (t) => t.assignedTo ? (adminsById.get(t.assignedTo)?.email || '—') : '—';

  const filtered = currentFilter === 'all' ? tasks : tasks.filter(t => t.status === currentFilter);

  return `
    <div class="todo-filters">
      ${FILTERS.map(([id, label]) =>
        `<button class="filter-pill ${currentFilter === id ? 'filter-pill-active' : ''}" data-filter="${id}">${label}</button>`
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
}

function renderChecklistView(tasks, editable) {
  const checklistTasks = tasks.filter(t => t.milestone);

  if (!checklistTasks.length) {
    return editable
      ? '<button id="seed-checklist-btn" class="btn-primary">Générer la checklist type</button>'
      : '<p style="padding:20px;color:var(--muted)">Aucun item de checklist.</p>';
  }

  return MILESTONES.map(([value, label]) => {
    const items = checklistTasks.filter(t => t.milestone === value);
    if (!items.length) return '';
    return `
      <div class="checklist-group">
        <h4>${label}</h4>
        <div class="checklist-items">
          ${items.map(t => `
            <div class="checklist-item">
              <input type="checkbox" class="task-quick-done" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''} ${editable ? '' : 'disabled'}>
              <span class="checklist-item-title ${t.status === 'done' ? 'checklist-item-done' : ''}">${escapeHtml(t.title)}</span>
              ${editable
                ? `<div class="table-actions">
                     <button class="btn-secondary btn-edit-task" data-id="${t.id}">Modifier</button>
                     <button class="btn-danger btn-delete-task" data-id="${t.id}">Supprimer</button>
                   </div>`
                : ''}
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');
}

function attachSharedHandlers(panel, tasks, editable, rerender) {
  if (!editable) return;

  panel.querySelectorAll('.btn-edit-task').forEach(btn =>
    btn.addEventListener('click', () => openTaskPanel(btn.dataset.id, tasks, { onSaved: rerender }))
  );
  panel.querySelectorAll('.btn-delete-task').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cette tâche ?')) return;
      await deleteDoc(doc(db, 'tasks', btn.dataset.id));
      rerender();
    })
  );
  panel.querySelectorAll('.task-quick-done').forEach(cb =>
    cb.addEventListener('change', async () => {
      await updateDoc(doc(db, 'tasks', cb.dataset.id), { status: cb.checked ? 'done' : 'todo' });
      rerender();
    })
  );
}

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

  if (editable) {
    document.getElementById('add-task-btn').addEventListener('click', () =>
      openTaskPanel(null, tasks, { onSaved: renderTodoTab })
    );
  }

  const viewToggle = `
    <div class="todo-view-toggle">
      <button class="filter-pill ${currentView === 'free' ? 'filter-pill-active' : ''}" data-view="free">Liste libre</button>
      <button class="filter-pill ${currentView === 'checklist' ? 'filter-pill-active' : ''}" data-view="checklist">Checklist</button>
    </div>`;

  const body = currentView === 'free'
    ? renderFreeView(tasks, guestsById, vendorsById, adminsById, editable)
    : renderChecklistView(tasks, editable);

  panel.innerHTML = viewToggle + body;

  panel.querySelectorAll('[data-view]').forEach(btn =>
    btn.addEventListener('click', () => { currentView = btn.dataset.view; renderTodoTab(); })
  );

  if (currentView === 'free') {
    panel.querySelectorAll('[data-filter]').forEach(btn =>
      btn.addEventListener('click', () => { currentFilter = btn.dataset.filter; renderTodoTab(); })
    );
  }

  if (currentView === 'checklist' && editable) {
    const seedBtn = document.getElementById('seed-checklist-btn');
    if (seedBtn) {
      seedBtn.addEventListener('click', async () => {
        seedBtn.disabled = true;
        await seedChecklist(tasks);
        renderTodoTab();
      });
    }
  }

  attachSharedHandlers(panel, tasks, editable, renderTodoTab);
}
```

- [ ] **Step 2: Bump the cache-bust version for `todo.js` in `script.js`**

`admin/todo.js` changed in this task. `admin/script.js` imports it as `'./todo.js?v=1'`. Per the project's cache-busting convention (see Task 1 Step 4), bump this too:

In `admin/script.js`, change:

```js
import { renderTodoTab } from './todo.js?v=1';
```

to:

```js
import { renderTodoTab } from './todo.js?v=2';
```

- [ ] **Step 3: Add view-toggle and checklist CSS**

Append to `admin/styles.css`:

```css
.todo-view-toggle{display:flex;gap:8px;margin-bottom:16px}
.checklist-group{margin-bottom:20px}
.checklist-group h4{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);margin-bottom:8px}
.checklist-items{display:flex;flex-direction:column;gap:6px}
.checklist-item{display:flex;align-items:center;gap:10px;background:var(--admin-card);border:1px solid var(--border);border-radius:8px;padding:8px 12px}
.checklist-item-title{flex:1;font-size:13.5px;color:var(--text)}
.checklist-item-done{color:var(--muted);text-decoration:line-through}
```

- [ ] **Step 4: Manual verification**

With an admin user that has `write` on `todo`:
- Open the To-Do tab → "Liste libre" pill active by default, table shows exactly as before (status filter pills, all existing tasks). No regression versus the pre-Task-2 behavior.
- Click "Checklist" pill → if no task has a `milestone` set yet, a "Générer la checklist type" button appears. Click it → button becomes briefly disabled, then the view re-renders showing all 6 milestone groups in order (12+ mois avant → Semaine du mariage), each with its items, none checked.
- Click a few checkboxes across different groups → each toggles immediately (status flips to done, strikethrough style applied via `checklist-item-done`), persists on switching to "Liste libre" and back to "Checklist".
- Click "Checklist" pill again after seeding — confirm the "Générer" button does NOT reappear (guard: zero-milestone-tasks condition no longer true).
- Click "Modifier" on a checklist item → confirm the shared edit panel opens with the "Palier" select pre-set to that item's milestone (from Task 1). Change it to a different milestone, save → item moves to the new group on next Checklist view render.
- Click "Modifier" on a checklist item, set "Palier" to "Aucun", save → item disappears from Checklist view (now a free task) and appears in "Liste libre".
- On "Liste libre", click "+ Ajouter une tâche", leave "Palier" as "Aucun", save → new task appears only in Liste libre, not in Checklist.
- Switch to the Calendrier tab → confirm nothing changed there (still shows only tasks with a `dueDate`, checklist or not) — this tab's code was not touched.
- Switch to a `read`-only user on `todo` → "Checklist" pill still works (view toggle isn't gated), items show without checkboxes-enabled or Modifier/Supprimer, and if no items exist yet, the empty-state message shows instead of a "Générer" button (button is `editable`-gated).
- Open the browser console throughout — no errors.

- [ ] **Step 5: Commit**

```bash
git add admin/todo.js admin/styles.css admin/script.js
git commit -m "feat: add milestone-grouped checklist view with default seed to To-Do tab"
```

---

## Post-plan note

`admin/calendar.js` requires no changes — it already queries all `tasks` with a non-null `dueDate` via `loadTasks()` from `tasks-shared.js`, and checklist items are ordinary `tasks` docs. Once Task 1 lets a checklist item carry a `dueDate` (already supported by the existing "Échéance" field in the shared panel), it will appear on the calendar automatically, exactly as the spec requires — no separate wiring needed.
