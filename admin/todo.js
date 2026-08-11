// admin/todo.js
import { db } from '../firebase-init.js';
import { collection, doc, addDoc, updateDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';
import { loadGuests } from './guests.js?v=7';
import { loadVendors } from './vendors.js?v=7';
import { loadUsers } from './users.js?v=1';
import { loadTasks, escapeHtml, STATUS_LABELS, MILESTONES, openTaskPanel } from './tasks-shared.js?v=3';

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
  ['1-3', "Confirmer le nombre définitif d'invités (RSVP)"],
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
  let order = Math.max(0, ...tasks.map(t => t.order || 0)) + 1;
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

  const renderItem = (t) => `
            <div class="checklist-item">
              <input type="checkbox" class="task-quick-done" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''} ${editable ? '' : 'disabled'}>
              <span class="checklist-item-title ${t.status === 'done' ? 'checklist-item-done' : ''}">${escapeHtml(t.title)}</span>
              ${editable
                ? `<div class="table-actions">
                     <button class="btn-secondary btn-edit-task" data-id="${t.id}">Modifier</button>
                     <button class="btn-danger btn-delete-task" data-id="${t.id}">Supprimer</button>
                   </div>`
                : ''}
            </div>`;

  const knownMilestones = new Set(MILESTONES.map(([value]) => value));

  const groups = MILESTONES.map(([value, label]) => {
    const items = checklistTasks.filter(t => t.milestone === value);
    if (!items.length) return '';
    return `
      <div class="checklist-group">
        <h4>${label}</h4>
        <div class="checklist-items">
          ${items.map(renderItem).join('')}
        </div>
      </div>`;
  });

  const orphanItems = checklistTasks.filter(t => !knownMilestones.has(t.milestone));
  if (orphanItems.length) {
    groups.push(`
      <div class="checklist-group">
        <h4>Autre</h4>
        <div class="checklist-items">
          ${orphanItems.map(renderItem).join('')}
        </div>
      </div>`);
  }

  return groups.join('');
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
    const seedBtn = panel.querySelector('#seed-checklist-btn');
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
