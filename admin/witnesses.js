// admin/witnesses.js
import { db } from '../firebase-init.js';
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadGuests, SIDE_LABELS, SIDE_BADGE } from './guests.js?v=4';
import { canWrite } from './permissions.js';

const SIDES = [
  { id: 'marie', label: 'Marié', honneurLabel: 'Garçons d\'honneur' },
  { id: 'mariee', label: 'Mariée', honneurLabel: 'Demoiselles d\'honneur' },
];

let cachedGuests = [];
let editableGlobal = false;

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderPersonCard(guest, { removable }) {
  const side = guest.side || 'deux';
  const removeBtn = removable
    ? `<button class="btn-icon witness-remove" data-id="${escapeHtml(guest.id)}" title="Retirer">✕</button>`
    : '';
  return `
    <div class="witness-card" draggable="${editableGlobal}" data-id="${escapeHtml(guest.id)}">
      <span class="witness-card-name">${escapeHtml(guest.name)}</span>
      <span class="badge ${SIDE_BADGE[side]}">${SIDE_LABELS[side]}</span>
      ${removeBtn}
    </div>`;
}

function renderColumn(sideDef, guests) {
  const temoins = guests.filter(g => g.weddingParty?.role === 'temoin' && g.weddingParty?.side === sideDef.id);
  const honneur = guests.filter(g => g.weddingParty?.role === 'honneur' && g.weddingParty?.side === sideDef.id);

  const slots = [0, 1].map(i => {
    const g = temoins[i];
    return g
      ? renderPersonCard(g, { removable: editableGlobal })
      : '<div class="witness-slot-empty">Vide</div>';
  }).join('');

  const honneurCards = honneur.length
    ? honneur.map(g => renderPersonCard(g, { removable: editableGlobal })).join('')
    : '<div class="witness-slot-empty">Aucun</div>';

  return `
    <div class="witness-column" data-side="${sideDef.id}">
      <h3>${sideDef.label}</h3>
      <div class="witness-section-label">Témoins (max 2)</div>
      <div class="witness-slots" data-side="${sideDef.id}" data-role="temoin">${slots}</div>
      <div class="witness-section-label">${sideDef.honneurLabel}</div>
      <div class="witness-honneur-list" data-side="${sideDef.id}" data-role="honneur">${honneurCards}</div>
    </div>`;
}

function renderPool(guests) {
  const pool = guests.filter(g => !g.weddingParty);
  const cards = pool.length
    ? pool.map(g => renderPersonCard(g, { removable: false })).join('')
    : '<p style="color:var(--muted)">Tous les invités sont assignés.</p>';
  return `
    <div class="witness-section-label">Invités disponibles</div>
    <div class="witness-pool" id="witness-pool">${cards}</div>`;
}

async function assignWitness(guestId, side, role) {
  if (role === 'temoin') {
    const currentCount = cachedGuests.filter(g =>
      g.id !== guestId &&
      g.weddingParty?.role === 'temoin' &&
      g.weddingParty?.side === side
    ).length;
    if (currentCount >= 2) return false;
  }
  try {
    await updateDoc(doc(db, 'guests', guestId), { weddingParty: { role, side } });
  } catch (err) {
    console.error('assignWitness: updateDoc failed', err);
    return false;
  }
  const guest = cachedGuests.find(g => g.id === guestId);
  if (guest) {
    guest.weddingParty = { role, side };
  }
  return true;
}

async function unassignWitness(guestId) {
  try {
    await updateDoc(doc(db, 'guests', guestId), { weddingParty: null });
  } catch (err) {
    console.error('unassignWitness: updateDoc failed', err);
    return false;
  }
  return true;
}

function flashReject(el) {
  el.classList.remove('witness-shake');
  void el.offsetWidth;
  el.classList.add('witness-shake');
}

function attachDragEvents(panel) {
  if (!editableGlobal) return;

  panel.querySelectorAll('.witness-card[draggable="true"]').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
    });
  });

  panel.querySelectorAll('.witness-slots, .witness-honneur-list').forEach(target => {
    target.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      target.classList.add('witness-drag-over');
    });
    target.addEventListener('dragleave', () => {
      target.classList.remove('witness-drag-over');
    });
    target.addEventListener('drop', async e => {
      e.preventDefault();
      target.classList.remove('witness-drag-over');
      const guestId = e.dataTransfer.getData('text/plain');
      if (!guestId) return;
      const side = target.dataset.side;
      const role = target.dataset.role;
      const ok = await assignWitness(guestId, side, role);
      if (!ok) {
        flashReject(target);
        return;
      }
      renderWitnessesTab();
    });
  });

  panel.querySelectorAll('.witness-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await unassignWitness(btn.dataset.id);
      if (!ok) {
        flashReject(btn);
        return;
      }
      renderWitnessesTab();
    });
  });
}

export async function renderWitnessesTab() {
  const panel = document.getElementById('tab-witnesses');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';
  document.getElementById('section-action').innerHTML = '';

  editableGlobal = canWrite('witnesses');
  cachedGuests = await loadGuests();

  panel.innerHTML = `
    <div class="witness-columns">
      ${SIDES.map(s => renderColumn(s, cachedGuests)).join('')}
    </div>
    ${renderPool(cachedGuests)}`;

  attachDragEvents(panel);
}
