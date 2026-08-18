// admin/guests.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadEvents } from './events.js?v=2';
import { canWrite } from './permissions.js';
import { loadChildrenAllowed } from './settings.js?v=1';

const guestsCol = collection(db, 'guests');

let statusFilter = 'all';
let eventFilters = new Set();

const STATUS_FILTERS = [['all', 'Tous'], ['confirmed', 'Confirmés'], ['pending', 'En attente'], ['declined', 'Refusés']];

export const SIDE_LABELS = { marie: 'Marié', mariee: 'Mariée', deux: 'Les deux' };
export const SIDE_BADGE  = { marie: 'badge-marie', mariee: 'badge-mariee', deux: 'badge-deux' };

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

function expectedGuestsOf(guest) {
  return guest?.expectedGuests || [{ name: guest?.name || '', type: 'adult' }];
}

function computeMaxCounts(expectedGuests) {
  const maxAdults = expectedGuests.filter(p => p.type === 'adult').length;
  const maxChildren = expectedGuests.filter(p => p.type === 'child').length;
  return { maxAdults, maxChildren };
}

function formatMax(g) {
  const maxAdults = g.maxAdults ?? 1;
  const maxChildren = g.maxChildren ?? 0;
  return `${maxAdults}A / ${maxChildren}E`;
}

export async function loadGuests() {
  const snap = await getDocs(guestsCol);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(g => !g.isPreview);
}

function guestStatus(g) {
  return g.rsvp?.status === 'confirmed' || g.rsvp?.status === 'declined' ? g.rsvp.status : 'pending';
}

function passesFilters(g) {
  if (statusFilter !== 'all' && guestStatus(g) !== statusFilter) return false;
  if (eventFilters.size > 0) {
    const assigned = g.assignedEvents || [];
    if (!assigned.some(id => eventFilters.has(id))) return false;
  }
  return true;
}

function renderGuestFilters(events) {
  return `
    <div class="guest-filters">
      <div class="filter-group">
        <button class="filter-pill ${eventFilters.size === 0 ? 'filter-pill-active' : ''}" data-event-filter="__all__">Tous les événements</button>
        ${events.map(e => `<button class="filter-pill ${eventFilters.has(e.id) ? 'filter-pill-active' : ''}" data-event-filter="${escapeHtml(e.id)}">${escapeHtml(e.title_fr)}</button>`).join('')}
      </div>
      <div class="filter-group">
        ${STATUS_FILTERS.map(([id, label]) => `<button class="filter-pill ${statusFilter === id ? 'filter-pill-active' : ''}" data-status-filter="${id}">${label}</button>`).join('')}
      </div>
    </div>`;
}

let menuCloseListenerAttached = false;
function ensureMenuCloseListener() {
  if (menuCloseListenerAttached) return;
  document.addEventListener('click', () => {
    document.querySelectorAll('.action-menu:not([hidden])').forEach(m => { m.hidden = true; });
  });
  menuCloseListenerAttached = true;
}

function renderActionsCell(g, editable) {
  const items = editable
    ? [
        { action: 'view-rsvp', label: 'Réponse' },
        { action: 'edit-guest', label: 'Modifier' },
        { action: 'delete-guest', label: 'Supprimer', danger: true },
      ]
    : [{ action: 'view-rsvp', label: 'Réponse' }];
  return `
    <div class="action-menu-wrap">
      <button type="button" class="btn-icon action-menu-btn" data-id="${escapeHtml(g.id)}" title="Actions" aria-label="Actions">⋮</button>
      <div class="action-menu" hidden>
        ${items.map(it => `<button type="button" class="action-menu-item ${it.danger ? 'action-menu-item-danger' : ''}" data-action="${it.action}" data-id="${escapeHtml(g.id)}">${it.label}</button>`).join('')}
      </div>
    </div>`;
}

function renderGuestRow(g, editable) {
  const side = g.side || 'deux';
  const rsvp = g.rsvp || {};
  const STATUS_LABELS = { confirmed: 'Confirmé', declined: 'Décliné', pending: 'En attente' };
  const STATUS_BADGE = { confirmed: 'badge-confirmed', declined: 'badge-declined', pending: 'badge-pending' };
  const status = rsvp.status || 'pending';
  const statusLabel = STATUS_LABELS[status] || STATUS_LABELS.pending;
  const statusClass = STATUS_BADGE[status] || STATUS_BADGE.pending;
  return `
    <tr class="guest-row" data-id="${escapeHtml(g.id)}">
      <td>${escapeHtml(g.name)}</td>
      <td><span class="badge ${SIDE_BADGE[side]}">${SIDE_LABELS[side]}</span></td>
      <td>${formatMax(g)}</td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>${rsvp.adults ?? ''}</td>
      <td>${rsvp.children ?? ''}</td>
      <td>
        <button class="btn-icon btn-copy-link" data-token="${escapeHtml(g.id)}" title="Copier le lien">${LINK_ICON}</button>
      </td>
      <td>${renderActionsCell(g, editable)}</td>
    </tr>`;
}

export function computeStats(guests) {
  const bySide = {
    marie: { confirmed: 0, pending: 0, declined: 0 },
    mariee: { confirmed: 0, pending: 0, declined: 0 },
    deux: { confirmed: 0, pending: 0, declined: 0 },
  };
  const totals = {
    confirmed: { adults: 0, children: 0 },
    pending:   { adults: 0, children: 0 },
    declined:  { adults: 0, children: 0 },
  };

  guests.forEach(g => {
    const status = g.rsvp?.status === 'confirmed' || g.rsvp?.status === 'declined' ? g.rsvp.status : 'pending';
    const side = bySide[g.side] ? g.side : 'deux';
    if (status === 'confirmed') {
      const a = g.rsvp.adults ?? 0;
      const c = g.rsvp.children ?? 0;
      totals.confirmed.adults += a;
      totals.confirmed.children += c;
      bySide[side].confirmed += a + c;
    } else if (status === 'declined') {
      const a = g.maxAdults ?? 1;
      const c = g.maxChildren ?? 0;
      totals.declined.adults += a;
      totals.declined.children += c;
      bySide[side].declined += a + c;
    } else {
      const a = g.maxAdults ?? 1;
      const c = g.maxChildren ?? 0;
      totals.pending.adults += a;
      totals.pending.children += c;
      bySide[side].pending += a + c;
    }
  });

  const adults = totals.confirmed.adults + totals.pending.adults + totals.declined.adults;
  const children = totals.confirmed.children + totals.pending.children + totals.declined.children;
  const total = adults + children;
  const confirmed = totals.confirmed.adults + totals.confirmed.children;
  const pending = totals.pending.adults + totals.pending.children;
  const declined = totals.declined.adults + totals.declined.children;

  return { total, confirmed, pending, declined, adults, children, totals, bySide };
}

function statSub(t) {
  return `<div class="stat-sub"><span>${t.adults} adulte${t.adults > 1 ? 's' : ''}</span><span>${t.children} enfant${t.children > 1 ? 's' : ''}</span></div>`;
}

export function renderStatsBar(stats) {
  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.total}</div>
        <div class="stat-label">Invités</div>
        ${statSub({ adults: stats.adults, children: stats.children })}
      </div>
      <div class="stat-card stat-confirmed">
        <div class="stat-value">${stats.confirmed}</div>
        <div class="stat-label">Confirmés</div>
        ${statSub(stats.totals.confirmed)}
      </div>
      <div class="stat-card stat-pending">
        <div class="stat-value">${stats.pending}</div>
        <div class="stat-label">En attente</div>
        ${statSub(stats.totals.pending)}
      </div>
      <div class="stat-card stat-declined">
        <div class="stat-value">${stats.declined}</div>
        <div class="stat-label">Refusés</div>
        ${statSub(stats.totals.declined)}
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

  const [guests, events, childrenAllowed] = await Promise.all([loadGuests(), loadEvents(), loadChildrenAllowed()]);
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));
  const validEventIds = new Set(events.map(e => e.id));
  Array.from(eventFilters).forEach(id => { if (!validEventIds.has(id)) eventFilters.delete(id); });
  const filteredGuests = guests.filter(passesFilters);

  panel.innerHTML = `
    ${renderGuestFilters(events)}
    <table class="admin-table">
      <thead>
        <tr>
          <th>Nom</th><th>Côté</th><th>Max</th><th>RSVP</th>
          <th>Adultes</th><th>Enfants</th><th>Lien</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filteredGuests.length
          ? filteredGuests.map(g => renderGuestRow(g, editable)).join('')
          : `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:40px">${guests.length > 0 ? 'Aucun invité ne correspond aux filtres.' : 'Aucun invité.'}</td></tr>`}
      </tbody>
    </table>`;

  panel.querySelectorAll('[data-event-filter]').forEach(btn =>
    btn.addEventListener('click', () => {
      const val = btn.dataset.eventFilter;
      if (val === '__all__') eventFilters.clear();
      else if (eventFilters.has(val)) eventFilters.delete(val);
      else eventFilters.add(val);
      renderGuestsTab();
    })
  );
  panel.querySelectorAll('[data-status-filter]').forEach(btn =>
    btn.addEventListener('click', () => { statusFilter = btn.dataset.statusFilter; renderGuestsTab(); })
  );

  ensureMenuCloseListener();
  panel.querySelectorAll('.action-menu-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const menu = btn.nextElementSibling;
      const wasOpen = !menu.hidden;
      document.querySelectorAll('.action-menu').forEach(m => { m.hidden = true; });
      menu.hidden = wasOpen;
    });
  });
  panel.querySelectorAll('.action-menu-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const guestId = btn.dataset.id;
      btn.closest('.action-menu').hidden = true;
      if (action === 'view-rsvp') {
        openRsvpDetail(guests.find(g => g.id === guestId), eventById);
      } else if (action === 'edit-guest') {
        openGuestPanel(guestId, guests, events, childrenAllowed);
      } else if (action === 'delete-guest') {
        if (!confirm('Supprimer cet invité ?')) return;
        await deleteDoc(doc(db, 'guests', guestId));
        renderGuestsTab();
      }
    });
  });
  if (editable) {
    document.getElementById('add-guest-btn').addEventListener('click', () =>
      openGuestPanel(null, guests, events, childrenAllowed)
    );
  }
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

function renderExpectedGuestRow(p, idx, childrenAllowed) {
  return `
    <div class="expected-guest-row" data-idx="${idx}">
      <input type="text" class="eg-name" placeholder="Nom (optionnel)" value="${escapeHtml(p.name || '')}">
      <select class="eg-type" ${childrenAllowed ? '' : 'disabled'}>
        <option value="adult" ${p.type === 'adult' ? 'selected' : ''}>Adulte</option>
        <option value="child" ${p.type === 'child' ? 'selected' : ''}>Enfant</option>
      </select>
      <button type="button" class="btn-icon eg-remove" data-idx="${idx}">✕</button>
    </div>`;
}

function openGuestPanel(id, guests, events, childrenAllowed) {
  const guest = id ? guests.find(g => g.id === id) : null;
  const isNew = !guest;

  const assignedSet = new Set(guest?.assignedEvents || []);
  const expectedGuests = isNew
    ? [{ name: '', type: 'adult' }]
    : expectedGuestsOf(guest).map(p => ({ ...p }));

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
      <label class="field">
        <span>Email</span>
        <input id="guest-email" type="email" value="${escapeHtml(guest?.email || '')}" placeholder="email@exemple.com">
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
        <span>Personnes attendues</span>
        <div class="expected-guest-list" id="expected-guest-list"></div>
        <button type="button" class="btn-secondary" id="eg-add">+ Ajouter une personne</button>
        <p class="expected-guest-summary" id="expected-guest-summary"></p>
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

  // Expected guests list
  function refreshExpectedGuestList() {
    const listEl = panelEl.querySelector('#expected-guest-list');
    listEl.innerHTML = expectedGuests.map((p, i) => renderExpectedGuestRow(p, i, childrenAllowed)).join('');
    listEl.querySelectorAll('.eg-name').forEach(input =>
      input.addEventListener('input', e => {
        expectedGuests[Number(e.target.closest('.expected-guest-row').dataset.idx)].name = e.target.value;
      })
    );
    listEl.querySelectorAll('.eg-type').forEach(select =>
      select.addEventListener('change', e => {
        expectedGuests[Number(e.target.closest('.expected-guest-row').dataset.idx)].type = e.target.value;
        refreshSummary();
      })
    );
    listEl.querySelectorAll('.eg-remove').forEach(btn =>
      btn.addEventListener('click', () => {
        if (expectedGuests.length <= 1) return;
        expectedGuests.splice(Number(btn.dataset.idx), 1);
        refreshExpectedGuestList();
      })
    );
    refreshSummary();
  }
  function refreshSummary() {
    const { maxAdults, maxChildren } = computeMaxCounts(expectedGuests);
    panelEl.querySelector('#expected-guest-summary').textContent = `Max actuel : ${maxAdults} adulte(s) / ${maxChildren} enfant(s)`;
  }
  refreshExpectedGuestList();

  panelEl.querySelector('#eg-add').addEventListener('click', () => {
    expectedGuests.push({ name: '', type: 'adult' });
    refreshExpectedGuestList();
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
    const email = panelEl.querySelector('#guest-email').value.trim();

    const side = panelEl.querySelector('.btn-group-item.active')?.dataset.side || 'deux';
    const assignedEvents = Array.from(
      panelEl.querySelectorAll('.event-card.selected')
    ).map(c => c.dataset.eventId);
    const { maxAdults, maxChildren } = computeMaxCounts(expectedGuests);
    if (maxAdults < 1) { saveBtn.disabled = false; saveBtn.textContent = isNew ? 'Créer' : 'Enregistrer'; return; }

    if (id) {
      await updateDoc(doc(db, 'guests', id), { name, email, side, assignedEvents, expectedGuests, maxAdults, maxChildren });
      close();
    } else {
      const token = generateToken();
      await setDoc(doc(db, 'guests', token), {
        name, email, side, assignedEvents, expectedGuests, maxAdults, maxChildren,
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
