// admin/dayof.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc,
  query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';
import { loadGuests } from './guests.js?v=5';
import { loadVendors } from './vendors.js?v=6';

const dayOfCol = collection(db, 'runOfShow');

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadRunOfShow() {
  const snap = await getDocs(query(dayOfCol, orderBy('time')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function renderDayOfTab() {
  const panel = document.getElementById('tab-dayof');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('dayof');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-dayof-btn" class="btn-primary">+ Ajouter une ligne</button>'
    : '';

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

  document.getElementById('print-dayof-btn').addEventListener('click', () => window.print());

  if (editable) {
    document.getElementById('add-dayof-btn').addEventListener('click', () =>
      openDayOfPanel(null, items, guests, vendors)
    );
    panel.querySelectorAll('.btn-edit-dayof').forEach(btn =>
      btn.addEventListener('click', () => openDayOfPanel(btn.dataset.id, items, guests, vendors))
    );
    panel.querySelectorAll('.btn-delete-dayof').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer cette ligne ?')) return;
        await deleteDoc(doc(db, 'runOfShow', btn.dataset.id));
        renderDayOfTab();
      })
    );
    panel.querySelectorAll('.dayof-quick-done').forEach(cb =>
      cb.addEventListener('change', async () => {
        await updateDoc(doc(db, 'runOfShow', cb.dataset.id), { done: cb.checked });
        renderDayOfTab();
      })
    );
  }
}

function openDayOfPanel(id, items, guests, vendors) {
  const item = id ? items.find(i => i.id === id) : null;
  const isNew = !item;
  const v = (key, fallback = '') => item?.[key] ?? fallback;

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  const linkOptionsFor = (type, selectedId) => {
    if (type === 'guest') {
      const realOptions = guests.map(g => `<option value="${escapeHtml(g.id)}" ${selectedId === g.id ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
      if (selectedId && !guests.some(g => g.id === selectedId)) {
        return `<option value="${escapeHtml(selectedId)}" selected>(supprimé)</option>${realOptions}`;
      }
      return realOptions;
    }
    if (type === 'vendor') {
      const realOptions = vendors.map(ve => `<option value="${escapeHtml(ve.id)}" ${selectedId === ve.id ? 'selected' : ''}>${escapeHtml(ve.name)}</option>`).join('');
      if (selectedId && !vendors.some(ve => ve.id === selectedId)) {
        return `<option value="${escapeHtml(selectedId)}" selected>(supprimé)</option>${realOptions}`;
      }
      return realOptions;
    }
    return '';
  };

  const responsibleType = v('responsibleType', 'none');
  const responsibleId = v('responsibleId', '');

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${isNew ? 'Nouvelle ligne' : 'Modifier la ligne'}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      <label class="field"><span>Heure</span><input id="dayof-time" type="time" value="${escapeHtml(v('time'))}" required></label>
      <label class="field"><span>Titre</span><input id="dayof-title" value="${escapeHtml(v('title'))}" required></label>
      <label class="field"><span>Lieu</span><input id="dayof-location" value="${escapeHtml(v('location'))}"></label>
      <label class="field"><span>Responsable</span>
        <select id="dayof-responsible-type">
          <option value="none" ${responsibleType === 'none' ? 'selected' : ''}>Aucun</option>
          <option value="vendor" ${responsibleType === 'vendor' ? 'selected' : ''}>Prestataire</option>
          <option value="guest" ${responsibleType === 'guest' ? 'selected' : ''}>Invité</option>
        </select>
      </label>
      <label class="field" id="dayof-responsible-id-field" ${responsibleType === 'none' ? 'hidden' : ''}>
        <span>Choisir</span>
        <select id="dayof-responsible-id">${linkOptionsFor(responsibleType, responsibleId)}</select>
      </label>
      <label class="field"><span>Notes</span><textarea id="dayof-notes">${escapeHtml(v('notes'))}</textarea></label>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px">
        <input id="dayof-done" type="checkbox" ${v('done') ? 'checked' : ''}><span>Fait</span>
      </label>
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">${isNew ? 'Créer' : 'Enregistrer'}</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  panelEl.querySelector('#dayof-responsible-type').addEventListener('change', (e) => {
    const type = e.target.value;
    panelEl.querySelector('#dayof-responsible-id-field').hidden = type === 'none';
    panelEl.querySelector('#dayof-responsible-id').innerHTML = linkOptionsFor(type, null);
  });

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const get = (sel) => panelEl.querySelector(sel).value;
    const title = get('#dayof-title').trim();
    const time = get('#dayof-time');
    if (!title || !time) return;
    const responsibleTypeVal = get('#dayof-responsible-type');
    const data = {
      time,
      title,
      location: get('#dayof-location'),
      responsibleType: responsibleTypeVal,
      responsibleId: responsibleTypeVal === 'none' ? null : (get('#dayof-responsible-id') || null),
      notes: get('#dayof-notes'),
      done: panelEl.querySelector('#dayof-done').checked,
    };
    if (id) {
      await updateDoc(doc(db, 'runOfShow', id), data);
    } else {
      await addDoc(dayOfCol, data);
    }
    close();
    renderDayOfTab();
  });
}
