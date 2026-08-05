// admin/guests.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadEvents } from './events.js';
import { canWrite } from './permissions.js';

const guestsCol = collection(db, 'guests');

const SIDE_LABELS = { marie: 'Marié', mariee: 'Mariée', deux: 'Les deux' };
const SIDE_BADGE  = { marie: 'badge-marie', mariee: 'badge-mariee', deux: 'badge-deux' };

const LINK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
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

export async function loadGuests() {
  const snap = await getDocs(guestsCol);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function renderGuestRow(g, eventById, editable) {
  const side = g.side || 'deux';
  const pills = (g.assignedEvents || [])
    .map(id => eventById[id]
      ? `<span class="pill">${escapeHtml(eventById[id].title_fr)}</span>`
      : '')
    .join('');
  const rsvp = g.rsvp || {};
  const STATUS_LABELS = { confirmed: 'Confirmé', declined: 'Décliné', pending: 'En attente' };
  const STATUS_BADGE = { confirmed: 'badge-confirmed', declined: 'badge-declined', pending: 'badge-pending' };
  const status = rsvp.status || 'pending';
  const statusLabel = STATUS_LABELS[status] || STATUS_LABELS.pending;
  const statusClass = STATUS_BADGE[status] || STATUS_BADGE.pending;
  const actionsCell = editable
    ? `<div class="table-actions">
         <button class="btn-secondary btn-view-rsvp" data-id="${escapeHtml(g.id)}">Réponse</button>
         <button class="btn-secondary btn-edit-guest" data-id="${escapeHtml(g.id)}">Modifier</button>
         <button class="btn-danger btn-delete-guest" data-id="${escapeHtml(g.id)}">Supprimer</button>
       </div>`
    : `<div class="table-actions">
         <button class="btn-secondary btn-view-rsvp" data-id="${escapeHtml(g.id)}">Réponse</button>
       </div>`;
  return `
    <tr class="guest-row" data-id="${escapeHtml(g.id)}">
      <td>${escapeHtml(g.name)}</td>
      <td><span class="badge ${SIDE_BADGE[side]}">${SIDE_LABELS[side]}</span></td>
      <td><div class="pills">${pills}</div></td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>${rsvp.adults ?? ''}</td>
      <td>${rsvp.children ?? ''}</td>
      <td>
        <button class="btn-icon btn-copy-link" data-token="${escapeHtml(g.id)}" title="Copier le lien">${LINK_ICON}</button>
      </td>
      <td>${actionsCell}</td>
    </tr>`;
}

export function computeStats(guests) {
  const bySide = {
    marie: { confirmed: 0, pending: 0, declined: 0 },
    mariee: { confirmed: 0, pending: 0, declined: 0 },
    deux: { confirmed: 0, pending: 0, declined: 0 },
  };
  let confirmed = 0, pending = 0, declined = 0, adults = 0, children = 0;

  guests.forEach(g => {
    const status = g.rsvp?.status === 'confirmed' || g.rsvp?.status === 'declined' ? g.rsvp.status : 'pending';
    const side = bySide[g.side] ? g.side : 'deux';
    bySide[side][status]++;
    if (status === 'confirmed') {
      confirmed++;
      adults += g.rsvp.adults ?? 0;
      children += g.rsvp.children ?? 0;
    } else if (status === 'declined') {
      declined++;
    } else {
      pending++;
    }
  });

  return { total: guests.length, confirmed, pending, declined, adults, children, bySide };
}

export function renderStatsBar(stats) {
  const totalPeople = stats.adults + stats.children;
  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.total}</div>
        <div class="stat-label">Invités</div>
      </div>
      <div class="stat-card stat-confirmed">
        <div class="stat-value">${stats.confirmed}</div>
        <div class="stat-label">Confirmés — ${totalPeople} personne${totalPeople > 1 ? 's' : ''}</div>
        <div class="stat-sub"><span>${stats.adults} adulte${stats.adults > 1 ? 's' : ''}</span><span>${stats.children} enfant${stats.children > 1 ? 's' : ''}</span></div>
      </div>
      <div class="stat-card stat-pending">
        <div class="stat-value">${stats.pending}</div>
        <div class="stat-label">En attente</div>
      </div>
      <div class="stat-card stat-declined">
        <div class="stat-value">${stats.declined}</div>
        <div class="stat-label">Refusés</div>
      </div>
    </div>
    <div class="stats-side-grid">
      ${['marie', 'mariee', 'deux'].map(side => `
        <div class="stats-side-card">
          <h4>${SIDE_LABELS[side]}</h4>
          <div class="stats-side-row"><span>Confirmés</span><span>${stats.bySide[side].confirmed}</span></div>
          <div class="stats-side-row"><span>En attente</span><span>${stats.bySide[side].pending}</span></div>
          <div class="stats-side-row"><span>Refusés</span><span>${stats.bySide[side].declined}</span></div>
        </div>`).join('')}
    </div>`;
}

export async function renderGuestsTab() {
  const panel = document.getElementById('tab-guests');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('guests');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-guest-btn" class="btn-primary">+ Ajouter un invité</button>'
    : '';

  const [guests, events] = await Promise.all([loadGuests(), loadEvents()]);
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));
  const stats = computeStats(guests);

  panel.innerHTML = `
    ${renderStatsBar(stats)}
    <table class="admin-table">
      <thead>
        <tr>
          <th>Nom</th><th>Côté</th><th>Événements</th><th>RSVP</th>
          <th>Adultes</th><th>Enfants</th><th>Lien</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${guests.length
          ? guests.map(g => renderGuestRow(g, eventById, editable)).join('')
          : '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:40px">Aucun invité.</td></tr>'}
      </tbody>
    </table>`;

  if (editable) {
    document.getElementById('add-guest-btn').addEventListener('click', () =>
      openGuestPanel(null, guests, events)
    );
    panel.querySelectorAll('.btn-edit-guest').forEach(btn =>
      btn.addEventListener('click', () => openGuestPanel(btn.dataset.id, guests, events))
    );
    panel.querySelectorAll('.btn-delete-guest').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer cet invité ?')) return;
        await deleteDoc(doc(db, 'guests', btn.dataset.id));
        renderGuestsTab();
      })
    );
  }
  panel.querySelectorAll('.btn-view-rsvp').forEach(btn =>
    btn.addEventListener('click', () => openRsvpDetail(guests.find(g => g.id === btn.dataset.id), eventById))
  );
  panel.querySelectorAll('.btn-copy-link').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = `${location.origin}/?invite=${btn.dataset.token}`;
      await navigator.clipboard.writeText(url);
      const orig = btn.innerHTML;
      btn.innerHTML = CHECK_ICON;
      setTimeout(() => { btn.innerHTML = orig; }, 1500);
    });
  });
}

function openRsvpDetail(guest, eventById) {
  const rsvp = guest?.rsvp || {};
  const status = rsvp.status || 'pending';
  const STATUS_LABELS = { confirmed: 'Confirmé', declined: 'Décliné', pending: 'En attente' };

  const confirmedIds = Object.keys(rsvp.confirmedEvents || {}).filter(id => rsvp.confirmedEvents[id]);
  const eventList = confirmedIds.length
    ? confirmedIds.map(id => `<span class="pill">${escapeHtml(eventById[id]?.title_fr || id)}</span>`).join('')
    : '<span style="color:var(--muted)">Aucun</span>';

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';
  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>Réponse de ${escapeHtml(guest?.name || '')}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="field"><span>Statut</span><div>${escapeHtml(STATUS_LABELS[status] || STATUS_LABELS.pending)}</div></div>
      <div class="field"><span>Nom déclaré</span><div>${escapeHtml(rsvp.name || '—')}</div></div>
      <div class="field"><span>Email</span><div>${escapeHtml(rsvp.email || '—')}</div></div>
      <div class="field"><span>Téléphone</span><div>${escapeHtml(rsvp.phone || '—')}</div></div>
      <div class="field"><span>Adultes / Enfants</span><div>${rsvp.adults ?? 0} / ${rsvp.children ?? 0}</div></div>
      <div class="field"><span>Autres adultes</span><div>${(rsvp.extraAdultNames || []).map(escapeHtml).join(', ') || '—'}</div></div>
      <div class="field"><span>Enfants (noms)</span><div>${(rsvp.childNames || []).map(escapeHtml).join(', ') || '—'}</div></div>
      <div class="field"><span>Événements confirmés</span><div class="pills">${eventList}</div></div>
      <div class="field"><span>Allergies / régime</span><div>${escapeHtml(rsvp.diet || '—')}</div></div>
      <div class="field"><span>Message</span><div>${escapeHtml(rsvp.message || '—')}</div></div>
      <div class="field"><span>Répondu le</span><div>${rsvp.respondedAt ? new Date(rsvp.respondedAt).toLocaleString('fr-FR') : '—'}</div></div>
    </div>
    <div class="panel-footer">
      <button class="btn-secondary" id="panel-cancel">Fermer</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);
  function close() { overlay.remove(); panelEl.remove(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);
}

function openGuestPanel(id, guests, events) {
  const guest = id ? guests.find(g => g.id === id) : null;
  const isNew = !guest;

  const assignedSet = new Set(guest?.assignedEvents || []);

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${isNew ? 'Nouvel invité' : 'Modifier l\'invité'}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      <label class="field">
        <span>Nom</span>
        <input id="guest-name" value="${escapeHtml(guest?.name || '')}" required>
      </label>
      <div class="field">
        <span>Côté</span>
        <div class="btn-group" id="side-group">
          ${['marie','mariee','deux'].map(s => `
            <button type="button" class="btn-group-item ${(guest?.side || 'deux') === s ? 'active' : ''}" data-side="${s}">
              ${SIDE_LABELS[s]}
            </button>`).join('')}
        </div>
      </div>
      <div class="field">
        <span>Événements</span>
        <div class="event-cards" id="event-cards">
          ${events.map(e => `
            <div class="event-card ${assignedSet.has(e.id) ? 'selected' : ''}" data-event-id="${escapeHtml(e.id)}">
              <div class="event-card-check">${assignedSet.has(e.id) ? '✓' : ''}</div>
              <div class="event-card-info">
                <div class="event-card-title">${escapeHtml(e.title_fr)}</div>
                <div class="event-card-meta">${escapeHtml(e.time_fr)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
      <div id="invite-result" hidden></div>
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">${isNew ? 'Créer' : 'Enregistrer'}</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); renderGuestsTab(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  // Side toggle
  panelEl.querySelectorAll('.btn-group-item').forEach(btn => {
    btn.addEventListener('click', () => {
      panelEl.querySelectorAll('.btn-group-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Event card toggle
  panelEl.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('click', () => {
      card.classList.toggle('selected');
      card.querySelector('.event-card-check').textContent =
        card.classList.contains('selected') ? '✓' : '';
    });
  });

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const saveBtn = panelEl.querySelector('#panel-save');
    saveBtn.disabled = true;
    saveBtn.textContent = isNew ? 'Création…' : 'Enregistrement…';

    const name = panelEl.querySelector('#guest-name').value.trim();
    if (!name) { saveBtn.disabled = false; saveBtn.textContent = isNew ? 'Créer' : 'Enregistrer'; return; }

    const side = panelEl.querySelector('.btn-group-item.active')?.dataset.side || 'deux';
    const assignedEvents = Array.from(
      panelEl.querySelectorAll('.event-card.selected')
    ).map(c => c.dataset.eventId);

    if (id) {
      await updateDoc(doc(db, 'guests', id), { name, side, assignedEvents });
      close();
    } else {
      const token = generateToken();
      await setDoc(doc(db, 'guests', token), {
        name, side, assignedEvents,
        createdAt: new Date().toISOString(),
        rsvp: { status: 'pending', name: '', email: '', phone: '', adults: 0, children: 0, extraAdultNames: [], childNames: [], diet: '', message: '', confirmedEvents: {}, respondedAt: null },
      });
      const inviteUrl = `${location.origin}/?invite=${token}`;
      const resultEl = panelEl.querySelector('#invite-result');
      resultEl.hidden = false;
      resultEl.innerHTML = `
        <div class="guest-invite-result">
          <span style="flex:1">${escapeHtml(inviteUrl)}</span>
          <button class="btn-secondary" id="copy-new-link">Copier</button>
        </div>`;
      resultEl.querySelector('#copy-new-link').addEventListener('click', async () => {
        await navigator.clipboard.writeText(inviteUrl);
        resultEl.querySelector('#copy-new-link').textContent = 'Copié !';
      });
      saveBtn.textContent = 'Créé ✓';
      panelEl.querySelector('#panel-cancel').textContent = 'Fermer';
    }
  });
}
