// admin/events.js
import { db } from '../firebase-init.js';
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const eventsCol = collection(db, 'events');

export async function loadEvents() {
  const snap = await getDocs(query(eventsCol, orderBy('order')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function saveEvent(id, data) {
  if (id) {
    await updateDoc(doc(db, 'events', id), data);
  } else {
    await addDoc(eventsCol, data);
  }
}

async function deleteEvent(id) {
  await deleteDoc(doc(db, 'events', id));
}

export async function renderEventsTab() {
  const panel = document.getElementById('tab-events');
  const events = await loadEvents();

  panel.innerHTML = `
    <button id="add-event-btn" class="btn-primary">+ Ajouter un événement</button>
    <table class="admin-table">
      <thead><tr><th>Ordre</th><th>Titre FR</th><th>Titre ZH</th><th>Heure</th><th>Lieu FR</th><th>Actions</th></tr></thead>
      <tbody>
        ${events.map(ev => `
          <tr>
            <td>${ev.order}</td>
            <td>${ev.title_fr}</td>
            <td>${ev.title_zh}</td>
            <td>${ev.time_fr}</td>
            <td>${ev.place_fr}</td>
            <td>
              <button class="btn-edit-event" data-id="${ev.id}">Modifier</button>
              <button class="btn-delete-event" data-id="${ev.id}">Supprimer</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
    <form id="event-form" class="event-form" hidden>
      <input type="hidden" id="event-id">
      <label class="field"><span>Ordre</span><input id="event-order" type="number" required></label>
      <label class="field"><span>Glyphe (zh)</span><input id="event-zh" required></label>
      <label class="field"><span>Heure FR</span><input id="event-time-fr" required></label>
      <label class="field"><span>Heure ZH</span><input id="event-time-zh" required></label>
      <label class="field"><span>Titre FR</span><input id="event-title-fr" required></label>
      <label class="field"><span>Titre ZH</span><input id="event-title-zh" required></label>
      <label class="field"><span>Lieu FR</span><input id="event-place-fr" required></label>
      <label class="field"><span>Lieu ZH</span><input id="event-place-zh" required></label>
      <label class="field"><span>Description FR</span><textarea id="event-desc-fr" required></textarea></label>
      <label class="field"><span>Description ZH</span><textarea id="event-desc-zh" required></textarea></label>
      <div class="form-actions">
        <button type="submit" class="btn-primary">Enregistrer</button>
        <button type="button" id="event-cancel-btn" class="btn-secondary">Annuler</button>
      </div>
    </form>
  `;

  document.getElementById('add-event-btn').addEventListener('click', () => openEventForm(null, events));
  panel.querySelectorAll('.btn-edit-event').forEach(btn => {
    btn.addEventListener('click', () => openEventForm(btn.dataset.id, events));
  });
  panel.querySelectorAll('.btn-delete-event').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cet événement ?')) return;
      await deleteEvent(btn.dataset.id);
      renderEventsTab();
    });
  });
  document.getElementById('event-cancel-btn').addEventListener('click', () => {
    document.getElementById('event-form').hidden = true;
  });
  document.getElementById('event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('event-id').value || null;
    const data = {
      order: Number(document.getElementById('event-order').value),
      zh: document.getElementById('event-zh').value,
      time_fr: document.getElementById('event-time-fr').value,
      time_zh: document.getElementById('event-time-zh').value,
      title_fr: document.getElementById('event-title-fr').value,
      title_zh: document.getElementById('event-title-zh').value,
      place_fr: document.getElementById('event-place-fr').value,
      place_zh: document.getElementById('event-place-zh').value,
      desc_fr: document.getElementById('event-desc-fr').value,
      desc_zh: document.getElementById('event-desc-zh').value,
    };
    await saveEvent(id, data);
    renderEventsTab();
  });
}

function openEventForm(id, events) {
  const form = document.getElementById('event-form');
  const ev = id ? events.find(e => e.id === id) : null;
  document.getElementById('event-id').value = id || '';
  document.getElementById('event-order').value = ev ? ev.order : events.length + 1;
  document.getElementById('event-zh').value = ev ? ev.zh : '';
  document.getElementById('event-time-fr').value = ev ? ev.time_fr : '';
  document.getElementById('event-time-zh').value = ev ? ev.time_zh : '';
  document.getElementById('event-title-fr').value = ev ? ev.title_fr : '';
  document.getElementById('event-title-zh').value = ev ? ev.title_zh : '';
  document.getElementById('event-place-fr').value = ev ? ev.place_fr : '';
  document.getElementById('event-place-zh').value = ev ? ev.place_zh : '';
  document.getElementById('event-desc-fr').value = ev ? ev.desc_fr : '';
  document.getElementById('event-desc-zh').value = ev ? ev.desc_zh : '';
  form.hidden = false;
}
