// admin/vendors.js
import { confirmDialog } from './ui-confirm.js?v=1';
import { showToast } from './ui-toast.js?v=1';
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';
import { mountPanel } from './ui-panel.js';

const vendorsCol = collection(db, 'vendors');

let statusFilters = new Set();
let vendorSortCol = 'category';
let vendorSortDir = 'asc';
let vendorCloseListenerAttached = false;

const STATUS_OPTIONS = [['candidat', 'Candidat'], ['contacted', 'Contacté'], ['booked', 'Réservé'], ['paid', 'Payé'], ['rejected', 'Rejeté']];

const CHEVRON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" class="filter-dropdown-chevron"><path d="m6 9 6 6 6-6"/></svg>`;
const SORT_BOTH = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="10" height="10"><path d="M5 10l3 3 3-3" opacity=".4"/><path d="M5 6l3-3 3 3" opacity=".4"/></svg>`;
const SORT_UP   = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="10" height="10"><path d="M5 10l3 3 3-3" opacity=".25"/><path d="M5 6l3-3 3 3"/></svg>`;
const SORT_DOWN = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="10" height="10"><path d="M5 10l3 3 3-3"/><path d="M5 6l3-3 3 3" opacity=".25"/></svg>`;

function sortIconV(col) {
  if (vendorSortCol !== col) return `<span class="sort-icon">${SORT_BOTH}</span>`;
  return `<span class="sort-icon sort-active">${vendorSortDir === 'asc' ? SORT_UP : SORT_DOWN}</span>`;
}

const VENDOR_SORT_FNS = {
  category:  v => (v.category || '').toLowerCase(),
  name:      v => (v.name || '').toLowerCase(),
  status:    v => v.status || 'contacted',
  total:     v => Number(v.total) || 0,
  paid:      v => paidAmount(v),
  remaining: v => (Number(v.total) || 0) - paidAmount(v),
  dueDate:   v => v.dueDate || '',
};

function sortVendors(list) {
  const fn = VENDOR_SORT_FNS[vendorSortCol] || VENDOR_SORT_FNS.category;
  return [...list].sort((a, b) => {
    const va = fn(a), vb = fn(b);
    const cmp = typeof va === 'string' ? va.localeCompare(vb, 'fr', { sensitivity: 'base' }) : va - vb;
    return vendorSortDir === 'asc' ? cmp : -cmp;
  });
}

function renderVendorDropdown() {
  const hasActive = statusFilters.size > 0;
  const summary = hasActive
    ? (statusFilters.size === 1 ? (STATUS_OPTIONS.find(([v]) => statusFilters.has(v))?.[1] ?? '') : `${statusFilters.size} sélectionnés`)
    : 'Tous';
  return `
    <div class="filter-dropdown" data-dropdown="vstatus">
      <button type="button" class="filter-dropdown-trigger${hasActive ? ' has-active' : ''}">
        Statut · ${summary} ${CHEVRON_SVG}
      </button>
      <div class="filter-dropdown-panel" hidden>
        <label class="filter-dropdown-item">
          <input type="checkbox" class="filter-dropdown-check" data-dropdown="vstatus" value="__all__"${statusFilters.size === 0 ? ' checked' : ''}> Tous
        </label>
        ${STATUS_OPTIONS.map(([val, lbl]) => `<label class="filter-dropdown-item">
          <input type="checkbox" class="filter-dropdown-check" data-dropdown="vstatus" value="${val}"${statusFilters.has(val) ? ' checked' : ''}> ${lbl}
        </label>`).join('')}
      </div>
    </div>`
}

async function markPreferred(vendorId, category, vendors) {
  const others = vendors.filter(v => v.id !== vendorId && v.category === category && v.preferred);
  await Promise.all(others.map(v => updateDoc(doc(db, 'vendors', v.id), { preferred: false })));
  await updateDoc(doc(db, 'vendors', vendorId), { preferred: true });
}

const STATUS_LABELS = { candidat: 'Candidat', contacted: 'Contacté', booked: 'Réservé', paid: 'Payé', rejected: 'Rejeté' };
const STATUS_BADGE = { candidat: 'badge-candidat', contacted: 'badge-contacted', booked: 'badge-booked', paid: 'badge-paid', rejected: 'badge-rejected' };
export const CATEGORIES = [
  'Lieu de réception', 'Fleuriste', 'Photographe', 'Traiteur', 'Musique', 'DJ',
  'Divertissement', 'Gâteau', 'Papeterie', 'Transport', 'Décorations et location',
  'Chapiteau', 'Robe de mariée et accessoires', 'Costumes', 'Alliances & bijoux',
  'Beauté, coiffure & maquillage', 'Robe chinoise', 'Frais notaire / contrat de mariage',
  'Nuit de noce', 'Cadeaux', 'Lune de miel', 'Cartes de remerciements', 'Extras', 'Autre',
];

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function fmtMoney(n) {
  return `${(Number(n) || 0).toFixed(2)} €`;
}

export function paidAmount(vendor) {
  return (vendor.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

export async function loadVendors() {
  const snap = await getDocs(vendorsCol);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || ''));
}

function renderVendorRow(v, editable) {
  const status = STATUS_LABELS[v.status] ? v.status : 'contacted';
  const paid = paidAmount(v);
  const remaining = (Number(v.total) || 0) - paid;
  const preferredCell = status === 'candidat'
    ? (v.preferred
        ? '<span class="badge badge-preferred">★ Préféré</span>'
        : (editable ? `<button type="button" class="btn-secondary btn-mark-preferred" data-id="${escapeHtml(v.id)}">Marquer préféré</button>` : ''))
    : '';
  const actionsCell = editable
    ? `<div class="table-actions">
         <button class="btn-secondary btn-edit-vendor" data-id="${escapeHtml(v.id)}">Modifier</button>
         <button class="btn-danger btn-delete-vendor" data-id="${escapeHtml(v.id)}">Supprimer</button>
       </div>`
    : '';
  return `
    <tr>
      <td>${escapeHtml(v.category || '')}</td>
      <td>${escapeHtml(v.name || '')}</td>
      <td><span class="badge ${STATUS_BADGE[status]}">${STATUS_LABELS[status]}</span></td>
      <td>${preferredCell}</td>
      <td>${fmtMoney(v.total)}</td>
      <td>${fmtMoney(paid)}</td>
      <td>${fmtMoney(remaining)}</td>
      <td>${v.dueDate ? escapeHtml(v.dueDate) : ''}</td>
      <td>${actionsCell}</td>
    </tr>`;
}

export async function renderVendorsTab() {
  const panel = document.getElementById('tab-vendors');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('vendors');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-vendor-btn" class="btn-primary">+ Ajouter une prestation</button>'
    : '';

  let vendors;
  try {
    vendors = await loadVendors();
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }

  const filtered = sortVendors(statusFilters.size === 0 ? vendors : vendors.filter(v => statusFilters.has(v.status || 'contacted')));

  panel.innerHTML = `
    <div class="filter-bar">${renderVendorDropdown()}</div>
    <p class="table-count">${filtered.length} prestation(s)${vendors.length !== filtered.length ? ` sur ${vendors.length}` : ''}</p>
    <div class="table-scroll"><table class="admin-table">
      <thead>
        <tr>
          <th class="sortable" data-sort="category">Catégorie ${sortIconV('category')}</th>
          <th class="sortable" data-sort="name">Nom ${sortIconV('name')}</th>
          <th class="sortable" data-sort="status">Statut ${sortIconV('status')}</th>
          <th>Préféré</th>
          <th class="sortable" data-sort="total">Total ${sortIconV('total')}</th>
          <th class="sortable" data-sort="paid">Versé ${sortIconV('paid')}</th>
          <th class="sortable" data-sort="remaining">Reste ${sortIconV('remaining')}</th>
          <th class="sortable" data-sort="dueDate">Échéance ${sortIconV('dueDate')}</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.length
          ? filtered.map(v => renderVendorRow(v, editable)).join('')
          : '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:40px">Aucune prestation.</td></tr>'}
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
      if (chk.value === '__all__') statusFilters.clear();
      else if (chk.checked) statusFilters.add(chk.value);
      else statusFilters.delete(chk.value);
      renderVendorsTab();
    });
  });
  panel.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (vendorSortCol === col) vendorSortDir = vendorSortDir === 'asc' ? 'desc' : 'asc';
      else { vendorSortCol = col; vendorSortDir = 'asc'; }
      renderVendorsTab();
    });
  });
  if (!vendorCloseListenerAttached) {
    document.addEventListener('click', () => {
      document.querySelectorAll('.filter-dropdown.is-open').forEach(dd => {
        dd.querySelector('.filter-dropdown-panel').hidden = true;
        dd.classList.remove('is-open');
      });
    });
    vendorCloseListenerAttached = true;
  }

  if (editable) {
    document.getElementById('add-vendor-btn').addEventListener('click', () => openVendorPanel(null, vendors));
    panel.querySelectorAll('.btn-edit-vendor').forEach(btn =>
      btn.addEventListener('click', () => openVendorPanel(btn.dataset.id, vendors))
    );
    panel.querySelectorAll('.btn-delete-vendor').forEach(btn =>
      btn.addEventListener('click', async () => {
        const v = vendors.find(v => v.id === btn.dataset.id);
        const ok = await confirmDialog({
          title: 'Supprimer cette prestation ?',
          message: v ? `${v.name} sera retiré(e). Vous aurez quelques secondes pour annuler.` : 'Cette action est définitive.',
          confirmLabel: 'Supprimer',
          danger: true,
        });
        if (!ok) return;
        const row = btn.closest('tr');
        if (row) row.style.display = 'none';
        showToast({
          message: v ? `${v.name} supprimé(e).` : 'Prestation supprimée.',
          onUndo: () => { if (row) row.style.display = ''; },
          commit: async () => {
            try {
              await deleteDoc(doc(db, 'vendors', btn.dataset.id));
              renderVendorsTab();
            } catch (err) {
              showToast({ message: `Erreur : ${err.message}`, tone: 'error', duration: 6000 });
            }
          },
        });
      })
    );
    panel.querySelectorAll('.btn-mark-preferred').forEach(btn =>
      btn.addEventListener('click', async () => {
        try {
          const category = vendors.find(v => v.id === btn.dataset.id)?.category;
          await markPreferred(btn.dataset.id, category, vendors);
          renderVendorsTab();
        } catch (err) {
          showToast({ message: `Erreur : ${err.message}`, tone: 'error' });
        }
      })
    );
  }
}

function renderPaymentRow(p, idx) {
  return `
    <div class="payment-row" data-idx="${idx}">
      <span>${escapeHtml(p.date || '')}</span>
      <span>${fmtMoney(p.amount)}</span>
      <span class="payment-row-note">${escapeHtml(p.note || '')}</span>
      <button type="button" class="btn-icon payment-row-remove" data-idx="${idx}" aria-label="Retirer">✕</button>
    </div>`;
}

function openVendorPanel(id, vendors) {
  const vendor = id ? vendors.find(v => v.id === id) : null;
  const isNew = !vendor;
  const payments = (vendor?.payments || []).map(p => ({ ...p }));

  const v = (key) => escapeHtml(vendor?.[key] ?? '');
  const isCustomCategory = vendor?.category && !CATEGORIES.includes(vendor.category);

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${isNew ? 'Nouvelle prestation' : 'Modifier la prestation'}</h3>
      <button class="btn-icon" id="panel-close" aria-label="Fermer">✕</button>
    </div>
    <div class="panel-body">
      <label class="field">
        <span>Catégorie</span>
        <select id="v-category">
          ${CATEGORIES.map(c => `<option value="${c}" ${(isCustomCategory ? c === 'Autre' : vendor?.category === c) ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </label>
      <label class="field" id="v-category-custom-field" ${isCustomCategory ? '' : 'hidden'}>
        <span>Nom de la catégorie</span>
        <input id="v-category-custom" value="${isCustomCategory ? v('category') : ''}">
      </label>
      <label class="field"><span>Nom</span><input id="v-name" value="${v('name')}" required></label>
      <label class="field"><span>Contact</span><input id="v-contact" value="${v('contact')}"></label>
      <label class="field">
        <span>Statut</span>
        <select id="v-status">
          ${Object.keys(STATUS_LABELS).map(s => `<option value="${s}" ${(vendor?.status || 'contacted') === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>Total prévu (€)</span><input id="v-total" type="number" min="0" step="0.01" value="${vendor?.total ?? ''}"></label>
      <label class="field"><span>Échéance</span><input id="v-due" type="date" value="${v('dueDate')}"></label>
      <label class="field"><span>Lien (devis/contrat)</span><input id="v-link" type="url" value="${v('link')}"></label>
      <label class="field"><span>Notes</span><textarea id="v-notes">${v('notes')}</textarea></label>
      <div class="field">
        <span>Versements</span>
        <div class="payment-list" id="payment-list">
          ${payments.map((p, i) => renderPaymentRow(p, i)).join('') || '<p style="color:var(--muted);font-size:12.5px">Aucun versement.</p>'}
        </div>
        <div class="payment-add-row">
          <input id="pay-date" type="date">
          <input id="pay-amount" type="number" min="0" step="0.01" placeholder="Montant">
          <input id="pay-note" type="text" placeholder="Note (optionnel)">
          <button type="button" class="btn-secondary" id="pay-add">Ajouter</button>
        </div>
      </div>
    </div>
    <p id="vendor-error" class="login-error" hidden></p>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">${isNew ? 'Créer' : 'Enregistrer'}</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  function close() { teardown(); overlay.remove(); panelEl.remove(); renderVendorsTab(); }
  const teardown = mountPanel(overlay, panelEl, close);
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  panelEl.querySelector('#v-category').addEventListener('change', (e) => {
    panelEl.querySelector('#v-category-custom-field').hidden = e.target.value !== 'Autre';
  });

  function refreshPaymentList() {
    const listEl = panelEl.querySelector('#payment-list');
    listEl.innerHTML = payments.map((p, i) => renderPaymentRow(p, i)).join('')
      || '<p style="color:var(--muted);font-size:12.5px">Aucun versement.</p>';
    listEl.querySelectorAll('.payment-row-remove').forEach(btn =>
      btn.addEventListener('click', () => {
        payments.splice(Number(btn.dataset.idx), 1);
        refreshPaymentList();
      })
    );
  }
  refreshPaymentList();

  panelEl.querySelector('#pay-add').addEventListener('click', () => {
    const date = panelEl.querySelector('#pay-date').value;
    const amount = Number(panelEl.querySelector('#pay-amount').value);
    const note = panelEl.querySelector('#pay-note').value.trim();
    if (!amount || amount <= 0) return;
    payments.push({ date, amount, note });
    panelEl.querySelector('#pay-date').value = '';
    panelEl.querySelector('#pay-amount').value = '';
    panelEl.querySelector('#pay-note').value = '';
    refreshPaymentList();
  });

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const name = panelEl.querySelector('#v-name').value.trim();
    if (!name) return;

    const saveBtn = panelEl.querySelector('#panel-save');
    saveBtn.disabled = true;
    saveBtn.textContent = isNew ? 'Création…' : 'Enregistrement…';

    const errorEl = panelEl.querySelector('#vendor-error');
    errorEl.hidden = true;

    const selectedCategory = panelEl.querySelector('#v-category').value;
    const customCategory = panelEl.querySelector('#v-category-custom').value.trim();
    const data = {
      category: selectedCategory === 'Autre' && customCategory ? customCategory : selectedCategory,
      name,
      contact: panelEl.querySelector('#v-contact').value.trim(),
      status: panelEl.querySelector('#v-status').value,
      total: Number(panelEl.querySelector('#v-total').value) || 0,
      dueDate: panelEl.querySelector('#v-due').value,
      link: panelEl.querySelector('#v-link').value.trim(),
      notes: panelEl.querySelector('#v-notes').value.trim(),
      payments,
    };

    try {
      if (id) {
        await updateDoc(doc(db, 'vendors', id), data);
      } else {
        await addDoc(vendorsCol, data);
      }
      close();
    } catch (err) {
      errorEl.textContent = `Erreur : ${err.message}`;
      errorEl.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = isNew ? 'Créer' : 'Enregistrer';
    }
  });
}
