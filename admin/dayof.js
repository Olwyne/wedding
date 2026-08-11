// admin/dayof.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc,
  query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';
import { loadGuests } from './guests.js?v=7';
import { loadVendors } from './vendors.js?v=7';
import { loadLanes, GENERAL_LANE_ID, GENERAL_LANE, openLaneManagerPanel } from './timeline-lanes.js?v=2';
import { renderTimelineGrid } from './dayof-timeline.js?v=2';

const dayOfCol = collection(db, 'runOfShow');
let currentView = 'table';

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

  const [items, guests, vendors, lanes] = await Promise.all([
    loadRunOfShow(), loadGuests(), loadVendors(),
    loadLanes().catch(err => {
      console.error('loadLanes failed', err);
      return [GENERAL_LANE];
    }),
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

  panel.innerHTML = `
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
    <div id="dayof-table-view" ${currentView === 'frise' ? 'hidden' : ''}>
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
    </table>
    </div>
    <div id="dayof-timeline-view" ${currentView === 'table' ? 'hidden' : ''}></div>`;

  document.getElementById('print-dayof-btn').addEventListener('click', () => window.print());

  document.querySelectorAll('.dayof-view-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view;
      renderDayOfTab();
    })
  );

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

  if (editable) {
    document.getElementById('manage-lanes-btn').addEventListener('click', () => {
      openLaneManagerPanel(lanes, () => renderDayOfTab());
    });
    document.getElementById('add-dayof-btn').addEventListener('click', () =>
      openDayOfPanel(null, items, guests, vendors, lanes)
    );
    panel.querySelectorAll('.btn-edit-dayof').forEach(btn =>
      btn.addEventListener('click', () => openDayOfPanel(btn.dataset.id, items, guests, vendors, lanes))
    );
    panel.querySelectorAll('.btn-delete-dayof').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer cette ligne ?')) return;
        try {
          await deleteDoc(doc(db, 'runOfShow', btn.dataset.id));
        } catch (err) {
          console.error('deleteDoc failed', err);
          alert('Une erreur est survenue, réessayez.');
        }
        renderDayOfTab();
      })
    );
    panel.querySelectorAll('.dayof-quick-done').forEach(cb =>
      cb.addEventListener('change', async () => {
        const previous = !cb.checked;
        try {
          await updateDoc(doc(db, 'runOfShow', cb.dataset.id), { done: cb.checked });
          renderDayOfTab();
        } catch (err) {
          console.error('updateDoc failed', err);
          cb.checked = previous;
          alert('Une erreur est survenue, réessayez.');
        }
      })
    );
  }
}

function openDayOfPanel(id, items, guests, vendors, lanes) {
  const item = id ? items.find(i => i.id === id) : null;
  const isNew = !item;
  const v = (key, fallback = '') => item?.[key] ?? fallback;

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  const linkOptionsFor = (type, selectedId) => {
    const list = type === 'guest' ? guests : type === 'vendor' ? vendors : null;
    if (!list) return '';
    const realOptions = list.map(x => `<option value="${escapeHtml(x.id)}" ${selectedId === x.id ? 'selected' : ''}>${escapeHtml(x.name)}</option>`).join('');
    if (selectedId && !list.some(x => x.id === selectedId)) {
      return `<option value="${escapeHtml(selectedId)}" selected>(supprimé)</option>${realOptions}`;
    }
    return realOptions;
  };

  const responsibleType = v('responsibleType', 'none');
  const responsibleId = v('responsibleId', '');
  const originalResponsibleType = responsibleType;
  const originalResponsibleId = responsibleId;

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${isNew ? 'Nouvelle ligne' : 'Modifier la ligne'}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      <label class="field"><span>Heure</span><input id="dayof-time" type="time" value="${escapeHtml(v('time'))}" required></label>
      <label class="field"><span>Heure fin</span><input id="dayof-end-time" type="time" value="${escapeHtml(v('endTime'))}"></label>
      <label class="field"><span>Lane</span>
        <select id="dayof-lane">
          ${lanes.map(l => `<option value="${escapeHtml(l.id)}" ${(v('laneId', GENERAL_LANE_ID) || GENERAL_LANE_ID) === l.id ? 'selected' : ''}>${escapeHtml(l.label)}</option>`).join('')}
        </select>
      </label>
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
    const preserved = type === originalResponsibleType ? originalResponsibleId : null;
    panelEl.querySelector('#dayof-responsible-id').innerHTML = linkOptionsFor(type, preserved);
  });

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const get = (sel) => panelEl.querySelector(sel).value;
    const title = get('#dayof-title').trim();
    const time = get('#dayof-time');
    if (!title || !time) return;
    const endTimeVal = get('#dayof-end-time');
    if (endTimeVal && endTimeVal <= time) {
      alert('L\'heure de fin doit être après l\'heure de début.');
      return;
    }
    const responsibleTypeVal = get('#dayof-responsible-type');
    const responsibleIdVal = responsibleTypeVal === 'none' ? null : (get('#dayof-responsible-id') || null);
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
    try {
      if (id) {
        await updateDoc(doc(db, 'runOfShow', id), data);
      } else {
        await addDoc(dayOfCol, data);
      }
    } catch (err) {
      console.error('save failed', err);
      alert('Une erreur est survenue, réessayez.');
      return;
    }
    close();
    renderDayOfTab();
  });
}
