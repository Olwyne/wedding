// admin/guests.js
import { db } from '../firebase-init.js';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadEvents } from './events.js';

const guestsCol = collection(db, 'guests');

const SIDE_LABELS = { marie: 'Marié', mariee: 'Mariée', deux: 'Les deux' };

function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function generateToken(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let token = '';
  for (let i = 0; i < length; i++) token += chars[bytes[i] % chars.length];
  return token;
}

async function loadGuests() {
  const snap = await getDocs(guestsCol);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function renderGuestRow(g, eventById) {
  const chips = (g.assignedEvents || []).map(id => eventById[id] ? eventById[id].title_fr : id).join(', ');
  const rsvp = g.rsvp || {};
  const statusLabel = rsvp.status === 'confirmed' ? 'Confirmé' : 'En attente';
  const statusClass = rsvp.status === 'confirmed' ? 'badge-confirmed' : 'badge-pending';
  return `
    <tr>
      <td>${escapeHtml(g.name)}</td>
      <td>${SIDE_LABELS[g.side] || g.side}</td>
      <td>${chips}</td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>${rsvp.adults ?? ''}</td>
      <td>${rsvp.children ?? ''}</td>
      <td>${escapeHtml(rsvp.diet ?? '')}</td>
      <td>${escapeHtml(rsvp.message ?? '')}</td>
      <td><button class="btn-copy-link" data-token="${g.id}">Copier le lien</button></td>
      <td>
        <button class="btn-edit-guest" data-id="${g.id}">Modifier</button>
        <button class="btn-delete-guest" data-id="${g.id}">Supprimer</button>
      </td>
    </tr>`;
}

export async function renderGuestsTab() {
  const panel = document.getElementById('tab-guests');
  const [guests, events] = await Promise.all([loadGuests(), loadEvents()]);
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));

  panel.innerHTML = `
    <button id="add-guest-btn" class="btn-primary">+ Ajouter un invité</button>
    <table class="admin-table">
      <thead>
        <tr>
          <th>Nom</th><th>Côté</th><th>Événements</th><th>Statut RSVP</th>
          <th>Adultes</th><th>Enfants</th><th>Régime</th><th>Message</th><th>Lien</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${guests.map(g => renderGuestRow(g, eventById)).join('')}
      </tbody>
    </table>
    <form id="guest-form" class="guest-form" hidden>
      <input type="hidden" id="guest-id">
      <label class="field"><span>Nom</span><input id="guest-name" required></label>
      <fieldset class="field">
        <legend>Côté</legend>
        <label><input type="radio" name="guest-side" value="marie"> Marié</label>
        <label><input type="radio" name="guest-side" value="mariee"> Mariée</label>
        <label><input type="radio" name="guest-side" value="deux" checked> Les deux</label>
      </fieldset>
      <fieldset class="field">
        <legend>Événements</legend>
        ${events.map(e => `<label><input type="checkbox" class="guest-event-cb" value="${e.id}"> ${e.title_fr}</label>`).join('')}
      </fieldset>
      <div class="form-actions">
        <button type="submit" class="btn-primary">Enregistrer</button>
        <button type="button" id="guest-cancel-btn" class="btn-secondary">Annuler</button>
      </div>
      <p id="guest-link-result" class="guest-link-result" hidden></p>
    </form>
  `;

  document.getElementById('add-guest-btn').addEventListener('click', () => openGuestForm(null, guests));
  panel.querySelectorAll('.btn-edit-guest').forEach(btn => {
    btn.addEventListener('click', () => openGuestForm(btn.dataset.id, guests));
  });
  panel.querySelectorAll('.btn-delete-guest').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cet invité ?')) return;
      await deleteDoc(doc(db, 'guests', btn.dataset.id));
      renderGuestsTab();
    });
  });
  panel.querySelectorAll('.btn-copy-link').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = `${location.origin}/?invite=${btn.dataset.token}`;
      await navigator.clipboard.writeText(url);
      btn.textContent = 'Copié !';
      setTimeout(() => { btn.textContent = 'Copier le lien'; }, 1500);
    });
  });
  document.getElementById('guest-cancel-btn').addEventListener('click', () => {
    document.getElementById('guest-form').hidden = true;
  });
  document.getElementById('guest-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('guest-id').value || null;
    const name = document.getElementById('guest-name').value;
    const side = document.querySelector('input[name="guest-side"]:checked').value;
    const assignedEvents = Array.from(document.querySelectorAll('.guest-event-cb:checked')).map(cb => cb.value);

    if (id) {
      await updateDoc(doc(db, 'guests', id), { name, side, assignedEvents });
    } else {
      const token = generateToken();
      await setDoc(doc(db, 'guests', token), {
        name, side, assignedEvents,
        createdAt: new Date().toISOString(),
        rsvp: { status: 'pending', name: '', adults: 0, children: 0, diet: '', message: '', confirmedEvents: {}, respondedAt: null },
      });
      const result = document.getElementById('guest-link-result');
      result.textContent = `Lien créé : ${location.origin}/?invite=${token}`;
      result.hidden = false;
    }
    renderGuestsTab();
  });
}

function openGuestForm(id, guests) {
  const form = document.getElementById('guest-form');
  const g = id ? guests.find(x => x.id === id) : null;
  document.getElementById('guest-id').value = id || '';
  document.getElementById('guest-name').value = g ? g.name : '';
  document.querySelectorAll('input[name="guest-side"]').forEach(r => {
    r.checked = g ? r.value === g.side : r.value === 'deux';
  });
  document.querySelectorAll('.guest-event-cb').forEach(cb => {
    cb.checked = g ? (g.assignedEvents || []).includes(cb.value) : false;
  });
  document.getElementById('guest-link-result').hidden = true;
  form.hidden = false;
}
