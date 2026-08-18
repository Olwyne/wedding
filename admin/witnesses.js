// admin/witnesses.js
import { db } from '../firebase-init.js';
import { doc, updateDoc, deleteField } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadGuests, SIDE_LABELS, SIDE_BADGE } from './guests.js?v=9';
import { canWrite } from './permissions.js';

const SIDES = [
  { id: 'marie', label: 'Marié' },
  { id: 'mariee', label: 'Mariée' },
];

const HONNEUR_TYPES = [
  { id: 'garcon', label: 'Garçons d\'honneur' },
  { id: 'demoiselle', label: 'Demoiselles d\'honneur' },
];

let cachedGuests = [];
let editableGlobal = false;

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Returns [{name, type}] for a guest
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

// Get the weddingParty assignment for a specific person
function getPersonRole(guest, personIdx) {
  // New format: weddingParties map
  if (guest.weddingParties) {
    return guest.weddingParties[String(personIdx)] || null;
  }
  // Legacy: weddingParty on personIdx 0 only
  if (personIdx === 0 && guest.weddingParty) {
    return guest.weddingParty;
  }
  return null;
}

function setPersonRole(guest, personIdx, role) {
  if (!guest.weddingParties) guest.weddingParties = {};
  if (role === null) {
    delete guest.weddingParties[String(personIdx)];
    // Also clear legacy field if personIdx === 0
    if (personIdx === 0) guest.weddingParty = null;
  } else {
    guest.weddingParties[String(personIdx)] = role;
  }
}

// Flat list of all individual persons across all guests
function allPersons(guests) {
  const result = [];
  for (const guest of guests) {
    const persons = personsOf(guest);
    for (let i = 0; i < persons.length; i++) {
      result.push({ guest, personIdx: i, person: persons[i], role: getPersonRole(guest, i) });
    }
  }
  return result;
}

function renderPersonCard(guest, personIdx, person, { removable }) {
  const side = guest.side || 'deux';
  const name = personName(guest, personIdx, person);
  const key = seatKey(guest.id, personIdx);
  const removeBtn = removable
    ? `<button class="btn-icon witness-remove" data-key="${escapeHtml(key)}" title="Retirer">✕</button>`
    : '';
  return `
    <div class="witness-card" draggable="${editableGlobal}" data-key="${escapeHtml(key)}">
      <span class="witness-card-name">${escapeHtml(name)}</span>
      <span class="badge ${SIDE_BADGE[side]}">${SIDE_LABELS[side]}</span>
      ${removeBtn}
    </div>`;
}

function renderColumn(sideDef, persons) {
  const temoins = persons.filter(p => p.role?.role === 'temoin' && p.role?.side === sideDef.id);

  const slots = [0, 1].map(i => {
    const p = temoins[i];
    return p
      ? renderPersonCard(p.guest, p.personIdx, p.person, { removable: editableGlobal })
      : '<div class="witness-slot-empty">Vide</div>';
  }).join('');

  const honneurSections = HONNEUR_TYPES.map(typeDef => {
    const honneur = persons.filter(p =>
      p.role?.role === 'honneur' &&
      p.role?.side === sideDef.id &&
      p.role?.honneurType === typeDef.id
    );
    const honneurCards = honneur.length
      ? honneur.map(p => renderPersonCard(p.guest, p.personIdx, p.person, { removable: editableGlobal })).join('')
      : '<div class="witness-slot-empty">Aucun</div>';
    return `
      <div class="witness-section-label">${typeDef.label}</div>
      <div class="witness-honneur-list" data-side="${sideDef.id}" data-role="honneur" data-honneur-type="${typeDef.id}">${honneurCards}</div>`;
  }).join('');

  return `
    <div class="witness-column" data-side="${sideDef.id}">
      <h3>${sideDef.label}</h3>
      <div class="witness-section-label">Témoins (max 2)</div>
      <div class="witness-slots" data-side="${sideDef.id}" data-role="temoin">${slots}</div>
      ${honneurSections}
    </div>`;
}

function renderPool(persons) {
  const unassigned = persons.filter(p => !p.role);
  const cards = unassigned.length
    ? unassigned.map(p => renderPersonCard(p.guest, p.personIdx, p.person, { removable: false })).join('')
    : '<p style="color:var(--muted)">Toutes les personnes sont assignées.</p>';
  return `
    <div class="witness-section-label">Personnes disponibles</div>
    <div class="witness-pool" id="witness-pool">${cards}</div>`;
}

async function assignWitness(key, side, role, honneurType) {
  const { guestId, personIdx } = parseSeatKey(key);
  if (role === 'temoin') {
    const persons = allPersons(cachedGuests);
    const currentCount = persons.filter(p =>
      !(p.guest.id === guestId && p.personIdx === personIdx) &&
      p.role?.role === 'temoin' &&
      p.role?.side === side
    ).length;
    if (currentCount >= 2) return 'cap';
  }
  const assignment = role === 'temoin' ? { role, side } : { role, side, honneurType };
  try {
    await updateDoc(doc(db, 'guests', guestId), {
      [`weddingParties.${personIdx}`]: assignment,
      // Clear legacy field when updating personIdx 0
      ...(personIdx === 0 ? { weddingParty: null } : {}),
    });
  } catch (err) {
    console.error('assignWitness: updateDoc failed', err);
    return 'error';
  }
  const guest = cachedGuests.find(g => g.id === guestId);
  if (guest) setPersonRole(guest, personIdx, assignment);
  return 'ok';
}

async function unassignWitness(key) {
  const { guestId, personIdx } = parseSeatKey(key);
  try {
    await updateDoc(doc(db, 'guests', guestId), {
      [`weddingParties.${personIdx}`]: deleteField(),
      ...(personIdx === 0 ? { weddingParty: null } : {}),
    });
  } catch (err) {
    console.error('unassignWitness: updateDoc failed', err);
    return 'error';
  }
  const guest = cachedGuests.find(g => g.id === guestId);
  if (guest) setPersonRole(guest, personIdx, null);
  return 'ok';
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
      e.dataTransfer.setData('text/plain', card.dataset.key);
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
      const key = e.dataTransfer.getData('text/plain');
      if (!key) return;
      const side = target.dataset.side;
      const role = target.dataset.role;
      const honneurType = target.dataset.honneurType;
      const result = await assignWitness(key, side, role, honneurType);
      if (result === 'cap') {
        flashReject(target);
        return;
      }
      if (result === 'error') {
        flashReject(target);
        alert('Une erreur est survenue, réessayez.');
        return;
      }
      renderWitnessesTab();
    });
  });

  panel.querySelectorAll('.witness-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const result = await unassignWitness(btn.dataset.key);
      if (result === 'error') {
        flashReject(btn);
        alert('Une erreur est survenue, réessayez.');
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

  try {
    cachedGuests = await loadGuests();
  } catch (err) {
    console.error('renderWitnessesTab: loadGuests failed', err);
    panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Erreur de chargement des invités.</p>';
    return;
  }

  const persons = allPersons(cachedGuests);

  panel.innerHTML = `
    <div class="witness-columns">
      ${SIDES.map(s => renderColumn(s, persons)).join('')}
    </div>
    ${renderPool(persons)}`;

  attachDragEvents(panel);
}
