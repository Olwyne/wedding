// admin/tables.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';

const tablesCol = collection(db, 'tables');

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export async function loadTables() {
  const snap = await getDocs(tablesCol);
  return snap.docs.map(d => ({ id: d.id, guestIds: [], ...d.data() }));
}

export function guestPartySize(guest) {
  return 1 + (guest.rsvp?.adults ?? 0) + (guest.rsvp?.children ?? 0);
}

export async function createTable(name, capacity, x, y) {
  const ref = await addDoc(tablesCol, { name, capacity, x, y, guestIds: [] });
  return ref.id;
}

export async function updateTablePosition(tableId, x, y) {
  await updateDoc(doc(db, 'tables', tableId), { x, y });
}

export async function assignGuestToTable(tables, guestId, targetTableId) {
  const updates = [];
  for (const t of tables) {
    const has = t.guestIds.includes(guestId);
    if (t.id === targetTableId && !has) {
      updates.push(updateDoc(doc(db, 'tables', t.id), { guestIds: [...t.guestIds, guestId] }));
    } else if (t.id !== targetTableId && has) {
      updates.push(updateDoc(doc(db, 'tables', t.id), { guestIds: t.guestIds.filter(id => id !== guestId) }));
    }
  }
  await Promise.all(updates);
}

export async function removeGuestFromTable(tableId, guestId, guestIds) {
  await updateDoc(doc(db, 'tables', tableId), { guestIds: guestIds.filter(id => id !== guestId) });
}

export async function deleteTable(tableId) {
  await deleteDoc(doc(db, 'tables', tableId));
}

export function occupancy(table, guestById) {
  return (table.guestIds || []).reduce((sum, id) => {
    const g = guestById[id];
    return sum + (g ? guestPartySize(g) : 0);
  }, 0);
}

function renderTableCircle(table, guestById) {
  const count = occupancy(table, guestById);
  const over = count > (Number(table.capacity) || 0);
  return `
    <div class="table-circle${over ? ' over-capacity' : ''}" data-id="${escapeHtml(table.id)}"
         style="left:${table.x}px;top:${table.y}px" draggable="true">
      <div class="table-circle-name">${escapeHtml(table.name)}</div>
      <div class="table-circle-count">${count}/${table.capacity}${over ? ' ⚠' : ''}</div>
    </div>`;
}

function openAddTablePanel(onCreated) {
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';
  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>Nouvelle table</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      <label class="field">
        <span>Nom</span>
        <input id="table-name" value="Table" required>
      </label>
      <label class="field">
        <span>Capacité</span>
        <input id="table-capacity" type="number" min="1" step="1" value="8" required>
      </label>
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">Créer</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;
  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const name = panelEl.querySelector('#table-name').value.trim();
    const capacity = Number(panelEl.querySelector('#table-capacity').value) || 1;
    if (!name) return;
    const x = 20 + Math.round(Math.random() * 300);
    const y = 20 + Math.round(Math.random() * 200);
    await createTable(name, capacity, x, y);
    close();
    onCreated();
  });
}

export async function renderTablesTab() {
  const panel = document.getElementById('tab-tables');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('tables');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-table-btn" class="btn-primary">+ Ajouter une table</button>'
    : '';

  let tables;
  try {
    tables = await loadTables();
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }

  const guestById = {};

  panel.innerHTML = `<div class="tables-canvas" id="tables-canvas">${tables.map(t => renderTableCircle(t, guestById)).join('')}</div>`;

  if (editable) {
    document.getElementById('add-table-btn').addEventListener('click', () =>
      openAddTablePanel(() => renderTablesTab())
    );
  }
}
