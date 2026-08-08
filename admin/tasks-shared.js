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

export const MILESTONES = [
  ['12plus', '12+ mois avant'],
  ['9-12', '9-12 mois avant'],
  ['6-9', '6-9 mois avant'],
  ['3-6', '3-6 mois avant'],
  ['1-3', '1-3 mois avant'],
  ['week', 'Semaine du mariage'],
];

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
        <label class="field"><span>Palier</span>
          <select id="task-milestone" ${dis}>
            <option value="none" ${!v('milestone') ? 'selected' : ''}>Aucun</option>
            ${MILESTONES.map(([val, label]) => `<option value="${val}" ${v('milestone') === val ? 'selected' : ''}>${label}</option>`).join('')}
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
          milestone: get('#task-milestone') === 'none' ? null : get('#task-milestone'),
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
