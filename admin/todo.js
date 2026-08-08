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

function renderTodoPanel(tasks, guestsById, vendorsById, adminsById, editable) {
  const panel = document.getElementById('tab-todo');

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

  panel.querySelectorAll('[data-filter]').forEach(btn =>
    btn.addEventListener('click', () => { currentFilter = btn.dataset.filter; renderTodoPanel(tasks, guestsById, vendorsById, adminsById, editable); })
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

  renderTodoPanel(tasks, guestsById, vendorsById, adminsById, editable);
}
