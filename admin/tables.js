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

export async function renderTablesTab() {
  const panel = document.getElementById('tab-tables');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';
  document.getElementById('section-action').innerHTML = '';

  let tables;
  try {
    tables = await loadTables();
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }

  panel.innerHTML = tables.length
    ? '<p style="padding:20px;color:var(--muted)">Tables chargées (rendu complet à venir).</p>'
    : '<p style="padding:20px;color:var(--muted)">Aucune table pour le moment.</p>';
}
