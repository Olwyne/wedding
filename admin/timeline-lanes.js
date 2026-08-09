// admin/timeline-lanes.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, writeBatch,
  query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const lanesCol = collection(db, 'timelineLanes');
const runOfShowCol = collection(db, 'runOfShow');

export const GENERAL_LANE_ID = '__general__';
export const GENERAL_LANE = { id: GENERAL_LANE_ID, label: 'Général', order: -1, color: '#9ca3af' };

export async function loadLanes() {
  const snap = await getDocs(query(lanesCol, orderBy('order')));
  return [GENERAL_LANE, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))];
}

export async function addLane(label, color) {
  const snap = await getDocs(lanesCol);
  const maxOrder = snap.docs.reduce((max, d) => Math.max(max, d.data().order ?? 0), 0);
  await addDoc(lanesCol, { label, color, order: maxOrder + 1 });
}

export async function renameLane(id, label, color) {
  await updateDoc(doc(db, 'timelineLanes', id), { label, color });
}

export async function reorderLane(lanes, id, direction) {
  const movable = lanes.filter(l => l.id !== GENERAL_LANE_ID);
  const idx = movable.findIndex(l => l.id === id);
  const targetIdx = idx + direction;
  if (idx === -1 || targetIdx < 0 || targetIdx >= movable.length) return;
  const a = movable[idx];
  const b = movable[targetIdx];
  await updateDoc(doc(db, 'timelineLanes', a.id), { order: b.order });
  await updateDoc(doc(db, 'timelineLanes', b.id), { order: a.order });
}

export async function deleteLane(id) {
  const itemsSnap = await getDocs(runOfShowCol);
  const batch = writeBatch(db);
  itemsSnap.docs.forEach(d => {
    if (d.data().laneId === id) batch.update(d.ref, { laneId: null });
  });
  batch.delete(doc(db, 'timelineLanes', id));
  await batch.commit();
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function openLaneManagerPanel(lanes, onChange) {
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  function rowsHtml(currentLanes) {
    const movable = currentLanes.filter(l => l.id !== GENERAL_LANE_ID);
    return currentLanes.map(lane => {
      const isGeneral = lane.id === GENERAL_LANE_ID;
      const mIdx = movable.findIndex(l => l.id === lane.id);
      return `
        <div class="lane-row" data-id="${lane.id}">
          <input type="color" class="lane-color" value="${lane.color}" ${isGeneral ? 'disabled' : ''}>
          <input type="text" class="lane-label" value="${escapeHtml(lane.label)}" ${isGeneral ? 'disabled' : ''}>
          <button class="btn-icon lane-up" title="Monter" ${isGeneral || mIdx <= 0 ? 'disabled' : ''}>↑</button>
          <button class="btn-icon lane-down" title="Descendre" ${isGeneral || mIdx >= movable.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn-danger lane-delete" ${isGeneral ? 'disabled' : ''}>Supprimer</button>
        </div>`;
    }).join('');
  }

  function render(currentLanes) {
    panelEl.innerHTML = `
      <div class="panel-header">
        <h3>Gérer les lanes</h3>
        <button class="btn-icon" id="panel-close">✕</button>
      </div>
      <div class="panel-body">
        <div class="lane-list">${rowsHtml(currentLanes)}</div>
        <div class="lane-add-row">
          <input type="color" id="new-lane-color" value="#6E1A1A">
          <input type="text" id="new-lane-label" placeholder="Nom de la lane">
          <button class="btn-primary" id="add-lane-btn">Ajouter</button>
        </div>
      </div>
      <div class="panel-footer">
        <button class="btn-secondary" id="panel-cancel">Fermer</button>
      </div>`;

    panelEl.querySelector('#panel-close').addEventListener('click', close);
    panelEl.querySelector('#panel-cancel').addEventListener('click', close);

    panelEl.querySelector('#add-lane-btn').addEventListener('click', async () => {
      const label = panelEl.querySelector('#new-lane-label').value.trim();
      if (!label) return;
      const color = panelEl.querySelector('#new-lane-color').value;
      await addLane(label, color);
      onChange();
      const fresh = await loadLanes();
      render(fresh);
    });

    panelEl.querySelectorAll('.lane-row').forEach(row => {
      const id = row.dataset.id;
      if (id === GENERAL_LANE_ID) return;
      const labelInput = row.querySelector('.lane-label');
      const colorInput = row.querySelector('.lane-color');
      const commit = async () => {
        await renameLane(id, labelInput.value.trim() || 'Sans nom', colorInput.value);
        onChange();
      };
      labelInput.addEventListener('change', commit);
      colorInput.addEventListener('change', commit);

      row.querySelector('.lane-up').addEventListener('click', async () => {
        await reorderLane(currentLanes, id, -1);
        onChange();
        render(await loadLanes());
      });
      row.querySelector('.lane-down').addEventListener('click', async () => {
        await reorderLane(currentLanes, id, 1);
        onChange();
        render(await loadLanes());
      });
      row.querySelector('.lane-delete').addEventListener('click', async () => {
        if (!confirm('Supprimer cette lane ? Les lignes qui y sont rattachées repasseront sur "Général".')) return;
        await deleteLane(id);
        onChange();
        render(await loadLanes());
      });
    });
  }

  function close() { overlay.remove(); panelEl.remove(); }
  overlay.addEventListener('click', close);

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);
  render(lanes);
}
