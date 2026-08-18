// admin/tables.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadGuests } from './guests.js?v=9';
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

// Returns [{name, type}] for a guest, always at least 1 entry
function personsOf(guest) {
  if (guest.expectedGuests && guest.expectedGuests.length > 0) return guest.expectedGuests;
  return [{ name: guest.name || '?', type: 'adult' }];
}

function personName(guest, personIdx, person) {
  return person?.name?.trim() || `${guest.name} – Invité ${personIdx + 1}`;
}

// seat key = "guestId:personIdx"
function seatKey(guestId, personIdx) { return `${guestId}:${personIdx}`; }
function parseSeatKey(key) {
  const colon = key.lastIndexOf(':');
  return { guestId: key.slice(0, colon), personIdx: Number(key.slice(colon + 1)) };
}

export async function loadTables() {
  const snap = await getDocs(tablesCol);
  return snap.docs.map(d => {
    const data = d.data();
    // Migrate legacy guestIds: treat each as personIdx 0
    if (!data.seats && data.guestIds && data.guestIds.length > 0) {
      data.seats = data.guestIds.map(id => seatKey(id, 0));
    }
    return { id: d.id, seats: [], ...data };
  });
}

export async function createTable(name, capacity, x, y) {
  const ref = await addDoc(tablesCol, { name, capacity, x, y, seats: [] });
  return ref.id;
}

export async function updateTablePosition(tableId, x, y) {
  await updateDoc(doc(db, 'tables', tableId), { x, y });
}

export async function assignPersonToTable(tables, guestId, personIdx, targetTableId) {
  const key = seatKey(guestId, personIdx);
  const updates = [];
  for (const t of tables) {
    const seats = t.seats || [];
    const has = seats.includes(key);
    if (t.id === targetTableId && !has) {
      updates.push(updateDoc(doc(db, 'tables', t.id), { seats: arrayUnion(key) }));
    } else if (t.id !== targetTableId && has) {
      updates.push(updateDoc(doc(db, 'tables', t.id), { seats: arrayRemove(key) }));
    }
  }
  await Promise.all(updates);
}

export async function removePersonFromTable(tableId, key) {
  await updateDoc(doc(db, 'tables', tableId), { seats: arrayRemove(key) });
}

export async function deleteTable(tableId) {
  await deleteDoc(doc(db, 'tables', tableId));
}

export function occupancy(table) {
  return (table.seats || []).length;
}

function renderTableCircle(table, editable) {
  const count = occupancy(table);
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

function renderPersonCard(guest, personIdx, person, editable) {
  const status = guest.rsvp?.status || 'pending';
  const typeLabel = person.type === 'child' ? 'E' : 'A';
  const key = seatKey(guest.id, personIdx);
  return `
    <div class="guest-card" draggable="${editable}" data-seat-key="${escapeHtml(key)}">
      <span>${escapeHtml(personName(guest, personIdx, person))} <span style="font-size:9px;opacity:.6">${typeLabel}</span> <span class="badge ${STATUS_BADGE[status]}" style="font-size:9px">${STATUS_LABELS[status]}</span></span>
    </div>`;
}

function renderGuestList(guests, placedKeys, statusFilter, editable) {
  const filters = [
    { key: 'all', label: 'Tous' },
    { key: 'confirmed', label: 'Confirmés' },
    { key: 'pending', label: 'En attente' },
    { key: 'declined', label: 'Refusés' },
  ];

  const cards = [];
  for (const g of guests) {
    if (statusFilter !== 'all' && (g.rsvp?.status || 'pending') !== statusFilter) continue;
    const persons = personsOf(g);
    for (let i = 0; i < persons.length; i++) {
      const key = seatKey(g.id, i);
      if (!placedKeys.has(key)) {
        cards.push(renderPersonCard(g, i, persons[i], editable));
      }
    }
  }

  return `
    <div class="tables-guest-list" id="tables-guest-list">
      <div class="tables-filter">
        ${filters.map(f => `<button type="button" class="guest-filter-btn${statusFilter === f.key ? ' active' : ''}" data-filter="${f.key}">${f.label}</button>`).join('')}
      </div>
      ${cards.length ? cards.join('') : '<p style="color:var(--muted);font-size:12px">Aucune personne non placée.</p>'}
    </div>`;
}

function openTableDetailPanel(table, guests, onChange, editable) {
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  const guestById = Object.fromEntries(guests.map(g => [g.id, g]));

  function occupantRows() {
    const seats = table.seats || [];
    if (!seats.length) return '<p style="color:var(--muted);font-size:13px">Aucune personne sur cette table.</p>';
    return seats.map(key => {
      const { guestId, personIdx } = parseSeatKey(key);
      const g = guestById[guestId];
      if (!g) return '';
      const persons = personsOf(g);
      const person = persons[personIdx];
      if (!person) return '';
      const typeLabel = person.type === 'child' ? 'enfant' : 'adulte';
      return `
        <div class="table-occupant-row" data-seat-key="${escapeHtml(key)}">
          <span>${escapeHtml(personName(g, personIdx, person))} <span style="font-size:11px;opacity:.6">(${typeLabel})</span></span>
          ${editable ? `<button class="btn-secondary btn-remove-occupant" data-seat-key="${escapeHtml(key)}">Retirer</button>` : ''}
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
        await removePersonFromTable(table.id, btn.dataset.seatKey);
        close();
        onChange();
      } catch (err) {
        alert(`Erreur : ${err.message}`);
      }
    });
  });

  panelEl.querySelector('#panel-delete-table').addEventListener('click', async () => {
    if (!confirm('Supprimer cette table ? Les personnes qu\'elle contient redeviendront non placées.')) return;
    try {
      await deleteTable(table.id);
      close();
      onChange();
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    }
  });
}

function wireDragAndDrop(panel, tables, guests, statusFilter, editable) {
  panel.querySelectorAll('.table-circle').forEach(circle => {
    circle.addEventListener('click', () => {
      const table = tables.find(t => t.id === circle.dataset.id);
      if (table) openTableDetailPanel(table, guests, () => renderTablesTab(statusFilter), editable);
    });
  });

  if (!editable) return;

  panel.querySelectorAll('.guest-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/seat-key', card.dataset.seatKey);
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
      if (e.dataTransfer.types.includes('text/seat-key')) e.preventDefault();
    });
    circle.addEventListener('drop', async e => {
      const key = e.dataTransfer.getData('text/seat-key');
      if (!key) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        const { guestId, personIdx } = parseSeatKey(key);
        await assignPersonToTable(tables, guestId, personIdx, circle.dataset.id);
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

  // Build set of all placed seat keys
  const placedKeys = new Set(tables.flatMap(t => t.seats || []));

  panel.innerHTML = `
    <div class="tables-layout">
      ${renderGuestList(guests, placedKeys, statusFilter, editable)}
      <div class="tables-canvas" id="tables-canvas">${tables.map(t => renderTableCircle(t, editable)).join('')}</div>
    </div>`;

  panel.querySelectorAll('.guest-filter-btn').forEach(btn =>
    btn.addEventListener('click', () => renderTablesTab(btn.dataset.filter))
  );

  if (editable) {
    document.getElementById('add-table-btn').addEventListener('click', () =>
      openAddTablePanel(() => renderTablesTab(statusFilter))
    );
  }

  wireDragAndDrop(panel, tables, guests, statusFilter, editable);
}
