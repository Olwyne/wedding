// admin/guests.js
import { confirmDialog } from './ui-confirm.js?v=1';
import { showToast } from './ui-toast.js?v=1';
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadEvents } from './events.js?v=7';
import { canWrite } from './permissions.js';
import { loadChildrenAllowed } from './settings.js?v=2';
import { sendEmailWithConfirm } from './email.js?v=1';
import { mountPanel } from './ui-panel.js';

const guestsCol = collection(db, 'guests');

let statusFilters = new Set();
let sideFilters = new Set();
let eventFilters = new Set();
let sortCol = 'name';
let sortDir = 'asc';

const STATUS_OPTIONS = [['confirmed', 'Confirmé'], ['pending', 'En attente'], ['declined', 'Décliné']];

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
  if (statusFilters.size > 0 && !statusFilters.has(guestStatus(g))) return false;
  if (sideFilters.size > 0 && !sideFilters.has(g.side || 'deux')) return false;
  if (eventFilters.size > 0) {
    const assigned = g.assignedEvents || [];
    if (!assigned.some(id => eventFilters.has(id))) return false;
  }
  return true;
}

function renderEmailBulkButton(type, allGuests) {
  const targetStatus = type === 'relance' ? 'pending' : 'confirmed';
  const eligible = allGuests.filter(g => passesFilters(g) && guestStatus(g) === targetStatus && g.email);
  if (eligible.length === 0) return '';
  const mailIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" style="vertical-align:-2px;margin-right:5px"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>';
  const label = type === 'relance'
    ? `Relancer tous (${eligible.length})`
    : `Rappel J à tous (${eligible.length})`;
  return `<button class="btn-secondary" id="bulk-email-btn" data-email-type="${type}">${mailIcon}${label}</button>`;
}

const SIDE_OPTIONS = [['marie', 'Marié'], ['mariee', 'Mariée'], ['deux', 'Les deux']];

const CHEVRON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" class="filter-dropdown-chevron"><path d="m6 9 6 6 6-6"/></svg>`;
const SORT_BOTH = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="10" height="10"><path d="M5 10l3 3 3-3" opacity=".4"/><path d="M5 6l3-3 3 3" opacity=".4"/></svg>`;
const SORT_UP   = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="10" height="10"><path d="M5 10l3 3 3-3" opacity=".25"/><path d="M5 6l3-3 3 3"/></svg>`;
const SORT_DOWN = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="10" height="10"><path d="M5 10l3 3 3-3"/><path d="M5 6l3-3 3 3" opacity=".25"/></svg>`;

function sortIcon(col) {
  if (sortCol !== col) return `<span class="sort-icon">${SORT_BOTH}</span>`;
  return `<span class="sort-icon sort-active">${sortDir === 'asc' ? SORT_UP : SORT_DOWN}</span>`;
}

const SORT_FNS = {
  name:     g => (g.name || '').toLowerCase(),
  side:     g => g.side || 'deux',
  status:   g => guestStatus(g),
  adults:   g => g.rsvp?.adults ?? -1,
  children: g => g.rsvp?.children ?? -1,
};

function sortGuests(list) {
  const fn = SORT_FNS[sortCol] || SORT_FNS.name;
  return [...list].sort((a, b) => {
    const va = fn(a), vb = fn(b);
    const cmp = typeof va === 'string' ? va.localeCompare(vb, 'fr', { sensitivity: 'base' }) : va - vb;
    return sortDir === 'asc' ? cmp : -cmp;
  });
}

function renderDropdown(id, label, options, selectedSet) {
  const hasActive = selectedSet.size > 0;
  const summary = hasActive
    ? (selectedSet.size === 1 ? (options.find(([v]) => selectedSet.has(v))?.[1] ?? '') : `${selectedSet.size} sélectionnés`)
    : 'Tous';
  return `
    <div class="filter-dropdown" data-dropdown="${id}">
      <button type="button" class="filter-dropdown-trigger${hasActive ? ' has-active' : ''}">
        ${label} · ${summary} ${CHEVRON_SVG}
      </button>
      <div class="filter-dropdown-panel" hidden>
        <label class="filter-dropdown-item">
          <input type="checkbox" class="filter-dropdown-check" data-dropdown="${id}" value="__all__"${selectedSet.size === 0 ? ' checked' : ''}> Tous
        </label>
        ${options.map(([val, lbl]) => `<label class="filter-dropdown-item">
          <input type="checkbox" class="filter-dropdown-check" data-dropdown="${id}" value="${val}"${selectedSet.has(val) ? ' checked' : ''}> ${escapeHtml(lbl)}
        </label>`).join('')}
      </div>
    </div>`;
}

function renderFilterBar(events, allGuests) {
  let bulkBtn = '';
  if (statusFilters.size === 1 && statusFilters.has('pending')) bulkBtn = renderEmailBulkButton('relance', allGuests);
  else if (statusFilters.size === 1 && statusFilters.has('confirmed')) bulkBtn = renderEmailBulkButton('rappel', allGuests);
  return `
    <div class="filter-bar">
      ${renderDropdown('events', 'Événement', events.map(e => [e.id, e.title_fr]), eventFilters)}
      ${renderDropdown('side', 'Côté', SIDE_OPTIONS, sideFilters)}
      ${renderDropdown('status', 'Statut', STATUS_OPTIONS, statusFilters)}
      ${bulkBtn ? `<div class="filter-bar-actions">${bulkBtn}</div>` : ''}
    </div>`;
}

let menuCloseListenerAttached = false;
function ensureMenuCloseListener() {
  if (menuCloseListenerAttached) return;
  document.addEventListener('click', () => {
    document.querySelectorAll('.action-menu:not([hidden])').forEach(m => { m.hidden = true; });
    document.querySelectorAll('.filter-dropdown.is-open').forEach(dd => {
      dd.querySelector('.filter-dropdown-panel').hidden = true;
      dd.classList.remove('is-open');
    });
  });
  menuCloseListenerAttached = true;
}

function renderActionsCell(g, editable) {
  const status = guestStatus(g);
  const mailIconSm = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" style="vertical-align:-1px;margin-right:5px"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>';
  const emailActions = g.email && (status === 'pending' || status === 'confirmed')
    ? [{ action: 'send-email', label: `${mailIconSm}${status === 'pending' ? 'Relancer' : 'Rappel J'}` }]
    : [];
  const items = editable
    ? [
        { action: 'view-rsvp', label: 'Réponse' },
        ...emailActions,
        { action: 'edit-guest', label: 'Modifier' },
        { action: 'delete-guest', label: 'Supprimer', danger: true },
      ]
    : [
        { action: 'view-rsvp', label: 'Réponse' },
        ...emailActions,
      ];
  return `
    <div class="action-menu-wrap">
      <button type="button" class="btn-icon action-menu-btn" data-id="${escapeHtml(g.id)}" aria-label="Actions"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg></button>
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
        <button class="btn-icon btn-copy-link" data-token="${escapeHtml(g.id)}" title="Copier le lien" aria-label="Copier le lien">${LINK_ICON}</button>
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

  // +2 for the couple (mariés)
  totals.confirmed.adults += 2;

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

  let guests, events, childrenAllowed;
  try {
    [guests, events, childrenAllowed] = await Promise.all([loadGuests(), loadEvents(), loadChildrenAllowed()]);
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));
  const validEventIds = new Set(events.map(e => e.id));
  Array.from(eventFilters).forEach(id => { if (!validEventIds.has(id)) eventFilters.delete(id); });
  const filteredGuests = sortGuests(guests.filter(passesFilters));

  panel.innerHTML = `
    ${renderFilterBar(events, guests)}
    <p class="table-count">${filteredGuests.length} invité(s)${guests.length !== filteredGuests.length ? ` sur ${guests.length}` : ''}</p>
    <div class="table-scroll"><table class="admin-table">
      <thead>
        <tr>
          <th class="sortable" data-sort="name">Nom ${sortIcon('name')}</th>
          <th class="sortable" data-sort="side">Côté ${sortIcon('side')}</th>
          <th>Max</th>
          <th class="sortable" data-sort="status">RSVP ${sortIcon('status')}</th>
          <th class="sortable" data-sort="adults">Adultes ${sortIcon('adults')}</th>
          <th class="sortable" data-sort="children">Enfants ${sortIcon('children')}</th>
          <th>Lien</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filteredGuests.length
          ? filteredGuests.map(g => renderGuestRow(g, editable)).join('')
          : `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:40px">${guests.length > 0 ? 'Aucun invité ne correspond aux filtres.' : 'Aucun invité.'}</td></tr>`}
      </tbody>
    </table></div>`;

  panel.querySelectorAll('.filter-dropdown-trigger').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const dd = btn.closest('.filter-dropdown');
      const ddPanel = dd.querySelector('.filter-dropdown-panel');
      const wasOpen = !ddPanel.hidden;
      document.querySelectorAll('.filter-dropdown.is-open').forEach(d => {
        d.querySelector('.filter-dropdown-panel').hidden = true;
        d.classList.remove('is-open');
      });
      if (!wasOpen) { ddPanel.hidden = false; dd.classList.add('is-open'); }
    });
  });
  panel.querySelectorAll('.filter-dropdown-check').forEach(chk => {
    chk.addEventListener('change', () => {
      const ddId = chk.dataset.dropdown;
      const set = ddId === 'events' ? eventFilters : ddId === 'side' ? sideFilters : statusFilters;
      if (chk.value === '__all__') set.clear();
      else if (chk.checked) set.add(chk.value);
      else set.delete(chk.value);
      renderGuestsTab();
    });
  });
  panel.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortCol = col; sortDir = 'asc'; }
      renderGuestsTab();
    });
  });

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
        openRsvpPanel(guests.find(g => g.id === guestId), eventById);
      } else if (action === 'edit-guest') {
        openGuestPanel(guestId, guests, events, childrenAllowed);
      } else if (action === 'delete-guest') {
        const g = guests.find(g => g.id === guestId);
        const ok = await confirmDialog({
          title: 'Supprimer cet invité ?',
          message: g ? `${g.name} sera retiré(e) de la liste. Vous aurez quelques secondes pour annuler.` : 'Cette action est définitive.',
          confirmLabel: 'Supprimer',
          danger: true,
        });
        if (!ok) return;
        const row = btn.closest('tr');
        if (row) row.style.display = 'none';
        showToast({
          message: g ? `${g.name} supprimé(e).` : 'Invité supprimé.',
          tone: 'default',
          onUndo: () => { if (row) row.style.display = ''; },
          commit: async () => {
            await deleteDoc(doc(db, 'guests', guestId));
            renderGuestsTab();
          },
        });
      } else if (action === 'send-email') {
        const g = guests.find(g => g.id === guestId);
        if (!g?.email) return;
        const status = guestStatus(g);
        if (status !== 'pending' && status !== 'confirmed') return;
        const type = status === 'pending' ? 'relance' : 'rappel';
        const recipient = {
          name: g.name,
          email: g.email,
          token: g.id,
          lang: g.lang || 'fr',
          events: Object.keys(g.rsvp?.confirmedEvents || {})
            .filter(id => g.rsvp.confirmedEvents[id])
            .map(id => eventById[id]?.title_fr || id),
        };
        try {
          await sendEmailWithConfirm(type, [recipient]);
        } catch { /* cancelled */ }
      }
    });
  });
  // Bulk email button
  const bulkEmailBtn = panel.querySelector('#bulk-email-btn');
  if (bulkEmailBtn) {
    bulkEmailBtn.addEventListener('click', async () => {
      const type = bulkEmailBtn.dataset.emailType;
      const targetStatus = type === 'relance' ? 'pending' : 'confirmed';
      const recipients = guests
        .filter(g => passesFilters(g) && guestStatus(g) === targetStatus && g.email)
        .map(g => ({
          name: g.name,
          email: g.email,
          token: g.id,
          lang: g.lang || 'fr',
          events: Object.keys(g.rsvp?.confirmedEvents || {})
            .filter(id => g.rsvp.confirmedEvents[id])
            .map(id => eventById[id]?.title_fr || id),
        }));
      try {
        await sendEmailWithConfirm(type, recipients);
      } catch { /* cancelled */ }
    });
  }
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

async function openRsvpPanel(guest, eventById) {
  const rsvp = guest?.rsvp || {};

  function nameListHtml(id, names) {
    const rows = (names || []).map((n, i) => `
      <div class="expected-guest-row" data-idx="${i}">
        <input type="text" class="name-list-input" value="${escapeHtml(n)}" placeholder="Nom">
        <button type="button" class="btn-icon name-list-remove" aria-label="Retirer">✕</button>
      </div>`).join('');
    return `<div id="${id}-list">${rows}</div>
      <button type="button" class="btn-secondary name-list-add" data-list="${id}" style="margin-top:4px">+ Ajouter</button>`;
  }

  const eventCheckboxes = Object.keys(eventById).map(id => {
    const checked = rsvp.confirmedEvents?.[id] ? 'checked' : '';
    return `<label style="display:flex;gap:6px;align-items:center;font-weight:normal;margin-bottom:4px">
      <input type="checkbox" class="event-cb" data-event-id="${escapeHtml(id)}" ${checked}>
      ${escapeHtml(eventById[id]?.title_fr || id)}
    </label>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';
  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>Réponse de ${escapeHtml(guest?.name || '')}</h3>
      <button class="btn-icon" id="panel-close" aria-label="Fermer">✕</button>
    </div>
    <div class="panel-body">
      <label class="field">
        <span>Statut</span>
        <select id="rsvp-status">
          <option value="pending"   ${rsvp.status === 'pending'   || !rsvp.status ? 'selected' : ''}>En attente</option>
          <option value="confirmed" ${rsvp.status === 'confirmed' ? 'selected' : ''}>Confirmé</option>
          <option value="declined"  ${rsvp.status === 'declined'  ? 'selected' : ''}>Décliné</option>
        </select>
      </label>
      <label class="field">
        <span>Nom déclaré</span>
        <input id="rsvp-name" type="text" value="${escapeHtml(rsvp.name || '')}">
      </label>
      <label class="field">
        <span>Email</span>
        <input id="rsvp-email" type="email" value="${escapeHtml(rsvp.email || '')}">
      </label>
      <label class="field">
        <span>Téléphone</span>
        <input id="rsvp-phone" type="text" value="${escapeHtml(rsvp.phone || '')}">
      </label>
      <label class="field">
        <span>Adultes</span>
        <input id="rsvp-adults" type="number" min="0" value="${rsvp.adults ?? 0}">
      </label>
      <label class="field">
        <span>Enfants</span>
        <input id="rsvp-children" type="number" min="0" value="${rsvp.children ?? 0}">
      </label>
      <div class="field">
        <span>Autres adultes (noms)</span>
        ${nameListHtml('extra-adults', rsvp.extraAdultNames)}
      </div>
      <div class="field">
        <span>Enfants (noms)</span>
        ${nameListHtml('child-names', rsvp.childNames)}
      </div>
      <div class="field">
        <span>Événements confirmés</span>
        <div>${eventCheckboxes || '<em style="color:var(--muted)">Aucun événement configuré</em>'}</div>
      </div>
      <label class="field">
        <span>Allergies / régime</span>
        <textarea id="rsvp-diet">${escapeHtml(rsvp.diet || '')}</textarea>
      </label>
      <label class="field">
        <span>Message</span>
        <textarea id="rsvp-message">${escapeHtml(rsvp.message || '')}</textarea>
      </label>
      <div class="field">
        <span>Répondu le</span>
        <div>${rsvp.respondedAt ? new Date(rsvp.respondedAt).toLocaleString('fr-FR') : '—'}</div>
      </div>
      <p id="panel-error" class="login-error" hidden></p>
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">Enregistrer</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  function isSaving() { return panelEl.querySelector('#panel-save').disabled; }
  function close() { teardown(); overlay.remove(); panelEl.remove(); }
  const teardown = mountPanel(overlay, panelEl, close);
  panelEl.querySelector('#panel-close').addEventListener('click', () => { if (!isSaving()) close(); });
  panelEl.querySelector('#panel-cancel').addEventListener('click', () => { if (!isSaving()) close(); });
  overlay.addEventListener('click', () => { if (!isSaving()) close(); });

  // Dynamic name lists
  function bindNameLists() {
    panelEl.querySelectorAll('.name-list-remove').forEach(btn => {
      btn.onclick = () => btn.closest('.expected-guest-row').remove();
    });
    panelEl.querySelectorAll('.name-list-add').forEach(btn => {
      btn.onclick = () => {
        const listEl = panelEl.querySelector(`#${btn.dataset.list}-list`);
        const idx = listEl.children.length;
        listEl.insertAdjacentHTML('beforeend', `
          <div class="expected-guest-row" data-idx="${idx}">
            <input type="text" class="name-list-input" value="" placeholder="Nom">
            <button type="button" class="btn-icon name-list-remove" aria-label="Retirer">✕</button>
          </div>`);
        bindNameLists();
      };
    });
  }
  bindNameLists();

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const saveBtn = panelEl.querySelector('#panel-save');
    const errEl = panelEl.querySelector('#panel-error');
    saveBtn.disabled = true;
    errEl.hidden = true;

    const confirmedEvents = {};
    panelEl.querySelectorAll('.event-cb').forEach(cb => {
      confirmedEvents[cb.dataset.eventId] = cb.checked;
    });

    const extraAdultNames = Array.from(
      panelEl.querySelectorAll('#extra-adults-list .name-list-input')
    ).map(i => i.value.trim()).filter(Boolean);

    const childNames = Array.from(
      panelEl.querySelectorAll('#child-names-list .name-list-input')
    ).map(i => i.value.trim()).filter(Boolean);

    const newRsvp = {
      ...rsvp,
      status:           panelEl.querySelector('#rsvp-status').value,
      name:             panelEl.querySelector('#rsvp-name').value.trim(),
      email:            panelEl.querySelector('#rsvp-email').value.trim(),
      phone:            panelEl.querySelector('#rsvp-phone').value.trim(),
      adults:           parseInt(panelEl.querySelector('#rsvp-adults').value, 10) || 0,
      children:         parseInt(panelEl.querySelector('#rsvp-children').value, 10) || 0,
      extraAdultNames,
      childNames,
      confirmedEvents,
      diet:             panelEl.querySelector('#rsvp-diet').value.trim(),
      message:          panelEl.querySelector('#rsvp-message').value.trim(),
    };

    try {
      await updateDoc(doc(db, 'guests', guest.id), { rsvp: newRsvp });
      close();
      renderGuestsTab();
    } catch (e) {
      errEl.textContent = e.message || 'Erreur lors de l\'enregistrement.';
      errEl.hidden = false;
      saveBtn.disabled = false;
    }
  });
}

function renderExpectedGuestRow(p, idx, childrenAllowed) {
  return `
    <div class="expected-guest-row" data-idx="${idx}">
      <input type="text" class="eg-name" placeholder="Nom (optionnel)" value="${escapeHtml(p.name || '')}">
      <select class="eg-type" ${childrenAllowed ? '' : 'disabled'}>
        <option value="adult" ${p.type === 'adult' ? 'selected' : ''}>Adulte</option>
        <option value="child" ${p.type === 'child' ? 'selected' : ''}>Enfant</option>
      </select>
      <button type="button" class="btn-icon eg-remove" data-idx="${idx}" aria-label="Retirer">✕</button>
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
      <button class="btn-icon" id="panel-close" aria-label="Fermer">✕</button>
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
        <span>Langue email</span>
        <div class="btn-group" id="lang-group">
          <button type="button" class="btn-group-item ${(guest?.lang || 'fr') === 'fr' ? 'active' : ''}" data-lang="fr">FR</button>
          <button type="button" class="btn-group-item ${(guest?.lang || 'fr') === 'zh' ? 'active' : ''}" data-lang="zh">ZH</button>
        </div>
      </div>
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

  function close() { teardown(); overlay.remove(); panelEl.remove(); renderGuestsTab(); }
  const teardown = mountPanel(overlay, panelEl, close);
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  // Side toggle
  panelEl.querySelectorAll('#side-group .btn-group-item').forEach(btn => {
    btn.addEventListener('click', () => {
      panelEl.querySelectorAll('#side-group .btn-group-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Lang toggle
  panelEl.querySelectorAll('#lang-group .btn-group-item').forEach(btn => {
    btn.addEventListener('click', () => {
      panelEl.querySelectorAll('#lang-group .btn-group-item').forEach(b => b.classList.remove('active'));
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

    const side = panelEl.querySelector('#side-group .btn-group-item.active')?.dataset.side || 'deux';
    const lang = panelEl.querySelector('#lang-group .btn-group-item.active')?.dataset.lang || 'fr';
    const assignedEvents = Array.from(
      panelEl.querySelectorAll('.event-card.selected')
    ).map(c => c.dataset.eventId);
    const { maxAdults, maxChildren } = computeMaxCounts(expectedGuests);
    if (maxAdults < 1) { saveBtn.disabled = false; saveBtn.textContent = isNew ? 'Créer' : 'Enregistrer'; return; }

    if (id) {
      await updateDoc(doc(db, 'guests', id), { name, email, side, lang, assignedEvents, expectedGuests, maxAdults, maxChildren });
      close();
    } else {
      const token = generateToken();
      await setDoc(doc(db, 'guests', token), {
        name, email, side, lang, assignedEvents, expectedGuests, maxAdults, maxChildren,
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
