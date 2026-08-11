// admin/tables.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadGuests } from './guests.js?v=8';
import { canWrite } from './permissions.js';

const tablesCol = collection(db, 'tables');

const STATUS_LABELS = { confirmed: 'Confirmé', declined: 'Décliné', pending: 'En attente' };
const STATUS_BADGE = { confirmed: 'badge-confirmed', declined: 'badge-declined', pending: 'badge-pending' };

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
  return Math.max(1, (guest.rsvp?.adults ?? 0) + (guest.rsvp?.children ?? 0));
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
      updates.push(updateDoc(doc(db, 'tables', t.id), { guestIds: arrayUnion(guestId) }));
    } else if (t.id !== targetTableId && has) {
      updates.push(updateDoc(doc(db, 'tables', t.id), { guestIds: arrayRemove(guestId) }));
    }
  }
  await Promise.all(updates);
}

export async function removeGuestFromTable(tableId, guestId) {
  await updateDoc(doc(db, 'tables', tableId), { guestIds: arrayRemove(guestId) });
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

function renderTableCircle(table, guestById, editable) {
  const count = occupancy(table, guestById);
  const over = count > (Number(table.capacity) || 0);
  return `
    <div class="table-circle${over ? ' over-capacity' : ''}" data-id="${escapeHtml(table.id)}"
         style="left:${table.x}px;top:${table.y}px" draggable="${editable}">
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
    try {
      await createTable(name, capacity, x, y);
      close();
      onCreated();
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    }
  });
}

function renderGuestCard(guest, editable) {
  const status = guest.rsvp?.status || 'pending';
  return `
    <div class="guest-card" draggable="${editable}" data-guest-id="${escapeHtml(guest.id)}">
      <span>${escapeHtml(guest.name)} <span class="badge ${STATUS_BADGE[status]}" style="font-size:9px">${STATUS_LABELS[status]}</span></span>
      <span class="guest-card-count">${guestPartySize(guest)}p</span>
    </div>`;
}

function renderGuestList(guests, placedIds, statusFilter, editable) {
  const unplaced = guests.filter(g => !placedIds.has(g.id) && (statusFilter === 'all' || (g.rsvp?.status || 'pending') === statusFilter));
  const filters = [
    { key: 'all', label: 'Tous' },
    { key: 'confirmed', label: 'Confirmés' },
    { key: 'pending', label: 'En attente' },
    { key: 'declined', label: 'Refusés' },
  ];
  return `
    <div class="tables-guest-list" id="tables-guest-list">
      <div class="tables-filter">
        ${filters.map(f => `<button type="button" class="guest-filter-btn${statusFilter === f.key ? ' active' : ''}" data-filter="${f.key}">${f.label}</button>`).join('')}
      </div>
      ${unplaced.length
        ? unplaced.map(g => renderGuestCard(g, editable)).join('')
        : '<p style="color:var(--muted);font-size:12px">Aucun invité non placé.</p>'}
    </div>`;
}

function openTableDetailPanel(table, guestById, onChange, editable) {
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  function occupantRows() {
    if (!table.guestIds.length) return '<p style="color:var(--muted);font-size:13px">Aucun invité sur cette table.</p>';
    return table.guestIds.map(id => {
      const g = guestById[id];
      if (!g) return '';
      return `
        <div class="table-occupant-row" data-guest-id="${escapeHtml(id)}">
          <span>${escapeHtml(g.name)} (${guestPartySize(g)}p)</span>
          ${editable ? `<button class="btn-secondary btn-remove-occupant" data-guest-id="${escapeHtml(id)}">Retirer</button>` : ''}
        </div>`;
    }).join('');
  }

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${escapeHtml(table.name)}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body" id="occupant-list">${occupantRows()}</div>
    <div class="panel-footer">
      ${editable ? '<button class="btn-danger" id="panel-delete-table">Supprimer la table</button>' : ''}
      <button class="btn-secondary" id="panel-cancel">Fermer</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  if (!editable) return;

  panelEl.querySelectorAll('.btn-remove-occupant').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await removeGuestFromTable(table.id, btn.dataset.guestId);
        close();
        onChange();
      } catch (err) {
        alert(`Erreur : ${err.message}`);
      }
    });
  });

  panelEl.querySelector('#panel-delete-table').addEventListener('click', async () => {
    if (!confirm('Supprimer cette table ? Les invités qu\'elle contient redeviendront non placés.')) return;
    try {
      await deleteTable(table.id);
      close();
      onChange();
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    }
  });
}

function wireDragAndDrop(panel, tables, statusFilter, guestByIdRef, editable) {
  panel.querySelectorAll('.table-circle').forEach(circle => {
    circle.addEventListener('click', () => {
      const table = tables.find(t => t.id === circle.dataset.id);
      if (table) openTableDetailPanel(table, guestByIdRef, () => renderTablesTab(statusFilter), editable);
    });
  });

  if (!editable) return;

  panel.querySelectorAll('.guest-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/guest-id', card.dataset.guestId);
      e.dataTransfer.effectAllowed = 'move';
    });
  });

  let dragOffset = { x: 0, y: 0 };

  panel.querySelectorAll('.table-circle').forEach(circle => {
    circle.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/table-id', circle.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      const rect = circle.getBoundingClientRect();
      dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    });
    circle.addEventListener('dragover', e => {
      if (e.dataTransfer.types.includes('text/guest-id')) e.preventDefault();
    });
    circle.addEventListener('drop', async e => {
      const guestId = e.dataTransfer.getData('text/guest-id');
      if (!guestId) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        await assignGuestToTable(tables, guestId, circle.dataset.id);
        renderTablesTab(statusFilter);
      } catch (err) {
        alert(`Erreur : ${err.message}`);
      }
    });
  });

  const canvas = document.getElementById('tables-canvas');
  canvas.addEventListener('dragover', e => {
    if (e.dataTransfer.types.includes('text/table-id')) e.preventDefault();
  });
  canvas.addEventListener('drop', async e => {
    const tableId = e.dataTransfer.getData('text/table-id');
    if (!tableId) return;
    e.preventDefault();
    const canvasRect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.round(e.clientX - canvasRect.left - dragOffset.x));
    const y = Math.max(0, Math.round(e.clientY - canvasRect.top - dragOffset.y));
    try {
      await updateTablePosition(tableId, x, y);
      renderTablesTab(statusFilter);
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    }
  });
}

export async function renderTablesTab(statusFilter = 'all') {
  const panel = document.getElementById('tab-tables');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('tables');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-table-btn" class="btn-primary">+ Ajouter une table</button>'
    : '';

  let tables, guests;
  try {
    [tables, guests] = await Promise.all([loadTables(), loadGuests()]);
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }

  const guestById = Object.fromEntries(guests.map(g => [g.id, g]));
  const validGuestIds = new Set(guests.map(g => g.id));
  tables = tables.map(t => ({ ...t, guestIds: t.guestIds.filter(id => validGuestIds.has(id)) }));
  const placedIds = new Set(tables.flatMap(t => t.guestIds));

  panel.innerHTML = `
    <div class="tables-layout">
      ${renderGuestList(guests, placedIds, statusFilter, editable)}
      <div class="tables-canvas" id="tables-canvas">${tables.map(t => renderTableCircle(t, guestById, editable)).join('')}</div>
    </div>`;

  panel.querySelectorAll('.guest-filter-btn').forEach(btn =>
    btn.addEventListener('click', () => renderTablesTab(btn.dataset.filter))
  );

  if (editable) {
    document.getElementById('add-table-btn').addEventListener('click', () =>
      openAddTablePanel(() => renderTablesTab(statusFilter))
    );
  }

  wireDragAndDrop(panel, tables, statusFilter, guestById, editable);
}
