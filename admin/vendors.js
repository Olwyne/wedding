// admin/vendors.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';

const vendorsCol = collection(db, 'vendors');

const STATUS_LABELS = { contacted: 'Contacté', booked: 'Réservé', paid: 'Payé' };
const STATUS_BADGE = { contacted: 'badge-contacted', booked: 'badge-booked', paid: 'badge-paid' };
const CATEGORIES = ['Traiteur', 'Photographe', 'DJ', 'Lieu', 'Fleuriste', 'Autre'];

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
  const status = v.status || 'contacted';
  const paid = paidAmount(v);
  const remaining = (Number(v.total) || 0) - paid;
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
    ? '<button id="add-vendor-btn" class="btn-primary">+ Ajouter un prestataire</button>'
    : '';

  let vendors;
  try {
    vendors = await loadVendors();
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }

  panel.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Catégorie</th><th>Nom</th><th>Statut</th><th>Total</th>
          <th>Versé</th><th>Reste</th><th>Échéance</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${vendors.length
          ? vendors.map(v => renderVendorRow(v, editable)).join('')
          : '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:40px">Aucun prestataire.</td></tr>'}
      </tbody>
    </table>`;

  if (editable) {
    document.getElementById('add-vendor-btn').addEventListener('click', () => openVendorPanel(null, vendors));
    panel.querySelectorAll('.btn-edit-vendor').forEach(btn =>
      btn.addEventListener('click', () => openVendorPanel(btn.dataset.id, vendors))
    );
    panel.querySelectorAll('.btn-delete-vendor').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer ce prestataire ?')) return;
        await deleteDoc(doc(db, 'vendors', btn.dataset.id));
        renderVendorsTab();
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
      <button type="button" class="btn-icon payment-row-remove" data-idx="${idx}">✕</button>
    </div>`;
}

function openVendorPanel(id, vendors) {
  const vendor = id ? vendors.find(v => v.id === id) : null;
  const isNew = !vendor;
  const payments = (vendor?.payments || []).map(p => ({ ...p }));

  const v = (key) => escapeHtml(vendor?.[key] ?? '');

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${isNew ? 'Nouveau prestataire' : 'Modifier le prestataire'}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      <label class="field">
        <span>Catégorie</span>
        <select id="v-category">
          ${CATEGORIES.map(c => `<option value="${c}" ${vendor?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
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
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">${isNew ? 'Créer' : 'Enregistrer'}</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); renderVendorsTab(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

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

    const data = {
      category: panelEl.querySelector('#v-category').value,
      name,
      contact: panelEl.querySelector('#v-contact').value.trim(),
      status: panelEl.querySelector('#v-status').value,
      total: Number(panelEl.querySelector('#v-total').value) || 0,
      dueDate: panelEl.querySelector('#v-due').value,
      link: panelEl.querySelector('#v-link').value.trim(),
      notes: panelEl.querySelector('#v-notes').value.trim(),
      payments,
    };

    if (id) {
      await updateDoc(doc(db, 'vendors', id), data);
    } else {
      await addDoc(vendorsCol, data);
    }
    close();
  });
}
