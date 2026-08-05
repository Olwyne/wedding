// admin/events.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc,
  query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';
import { sanitizeHtml, mountRichEditor } from './richtext.js';

const eventsCol = collection(db, 'events');

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export async function loadEvents() {
  const snap = await getDocs(query(eventsCol, orderBy('order')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function renderEventsTab() {
  const panel = document.getElementById('tab-events');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('events');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-event-btn" class="btn-primary">+ Ajouter un événement</button>'
    : '';

  const events = await loadEvents();

  panel.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr><th>Ordre</th><th>Titre FR</th><th>Titre ZH</th><th>Heure FR</th><th>Lieu FR</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${events.map(ev => `
          <tr>
            <td>${ev.order}</td>
            <td>${escapeHtml(ev.title_fr)}</td>
            <td>${escapeHtml(ev.title_zh)}</td>
            <td>${escapeHtml(ev.time_fr)}</td>
            <td>${escapeHtml(ev.place_fr)}</td>
            <td>${editable
              ? `<div class="table-actions">
                   <button class="btn-secondary btn-edit-event" data-id="${ev.id}">Modifier</button>
                   <button class="btn-danger btn-delete-event" data-id="${ev.id}">Supprimer</button>
                 </div>`
              : ''}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  if (editable) {
    document.getElementById('add-event-btn').addEventListener('click', () =>
      openEventPanel(null, events)
    );
    panel.querySelectorAll('.btn-edit-event').forEach(btn =>
      btn.addEventListener('click', () => openEventPanel(btn.dataset.id, events))
    );
    panel.querySelectorAll('.btn-delete-event').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer cet événement ?')) return;
        await deleteDoc(doc(db, 'events', btn.dataset.id));
        renderEventsTab();
      })
    );
  }
}

function openEventPanel(id, events) {
  const ev = id ? events.find(e => e.id === id) : null;
  const isNew = !ev;
  const v = (key) => {
    const val = ev?.[key] ?? '';
    return typeof val === 'string' ? escapeHtml(val) : val;
  };

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${isNew ? 'Nouvel événement' : 'Modifier l\'événement'}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      <label class="field"><span>Ordre</span><input id="ev-order" type="number" value="${v('order') || events.length + 1}" required></label>
      <label class="field"><span>Glyphe ZH</span><input id="ev-zh" value="${v('zh')}" required></label>
      <label class="field"><span>Heure FR</span><input id="ev-time-fr" value="${v('time_fr')}" required></label>
      <label class="field"><span>Heure ZH</span><input id="ev-time-zh" value="${v('time_zh')}" required></label>
      <label class="field"><span>Titre FR</span><input id="ev-title-fr" value="${v('title_fr')}" required></label>
      <label class="field"><span>Titre ZH</span><input id="ev-title-zh" value="${v('title_zh')}" required></label>
      <label class="field"><span>Lieu FR</span><input id="ev-place-fr" value="${v('place_fr')}" required></label>
      <label class="field"><span>Lieu ZH</span><input id="ev-place-zh" value="${v('place_zh')}" required></label>
      <label class="field"><span>Description FR</span><div class="rich-editor-mount" id="ev-desc-fr-mount"></div></label>
      <label class="field"><span>Description ZH</span><div class="rich-editor-mount" id="ev-desc-zh-mount"></div></label>
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">${isNew ? 'Créer' : 'Enregistrer'}</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  const descFrEditor = mountRichEditor(panelEl.querySelector('#ev-desc-fr-mount'), ev?.desc_fr || '');
  const descZhEditor = mountRichEditor(panelEl.querySelector('#ev-desc-zh-mount'), ev?.desc_zh || '');

  function close() { overlay.remove(); panelEl.remove(); renderEventsTab(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const get = (sel) => panelEl.querySelector(sel).value;
    const data = {
      order: Number(get('#ev-order')),
      zh: get('#ev-zh'),
      time_fr: get('#ev-time-fr'),
      time_zh: get('#ev-time-zh'),
      title_fr: get('#ev-title-fr'),
      title_zh: get('#ev-title-zh'),
      place_fr: get('#ev-place-fr'),
      place_zh: get('#ev-place-zh'),
      desc_fr: sanitizeHtml(descFrEditor.getHtml()),
      desc_zh: sanitizeHtml(descZhEditor.getHtml()),
    };
    if (id) {
      await updateDoc(doc(db, 'events', id), data);
    } else {
      await addDoc(eventsCol, data);
    }
    close();
  });
}
