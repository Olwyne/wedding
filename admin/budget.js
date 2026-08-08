// admin/budget.js
import { db } from '../firebase-init.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadVendors, paidAmount, CATEGORIES } from './vendors.js?v=6';
import { canWrite } from './permissions.js';

const budgetDocRef = doc(db, 'settings', 'budget');

const PENCIL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';

const ENGAGED_STATUSES = ['contacted', 'booked', 'paid'];

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function fmtMoney(n) {
  return `${(Number(n) || 0).toFixed(2)} €`;
}

async function loadBudgetDoc() {
  try {
    const snap = await getDoc(budgetDocRef);
    const data = snap.exists() ? snap.data() : {};
    return { target: Number(data.target) || 0, categoryTargets: data.categoryTargets || {} };
  } catch (err) {
    console.error('loadBudgetDoc failed', err);
    return { target: 0, categoryTargets: {} };
  }
}

async function saveTarget(target) {
  await setDoc(budgetDocRef, { target }, { merge: true });
}

async function saveCategoryTarget(category, categoryTargets, value) {
  const next = { ...categoryTargets, [category]: value };
  await setDoc(budgetDocRef, { categoryTargets: next }, { merge: true });
}

function computeCategoryStats(vendors, categoryTargets) {
  const byCategory = {};
  CATEGORIES.forEach(cat => {
    byCategory[cat] = { category: cat, engaged: 0, paid: 0 };
  });
  vendors.forEach(v => {
    if (!ENGAGED_STATUSES.includes(v.status)) return;
    const cat = v.category || 'Autre';
    if (!byCategory[cat]) byCategory[cat] = { category: cat, engaged: 0, paid: 0 };
    byCategory[cat].engaged += Number(v.total) || 0;
    byCategory[cat].paid += paidAmount(v);
  });
  Object.keys(categoryTargets).forEach(cat => {
    if (!byCategory[cat]) byCategory[cat] = { category: cat, engaged: 0, paid: 0 };
  });
  return Object.values(byCategory)
    .map(c => ({ ...c, target: Number(categoryTargets[c.category]) || 0 }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

// `key` identifies this target in the editingKeys set ('global', or `category:<name>`).
// `dataKeyAttr` is the data-key="..." attribute repeated on the input/save button so
// their click/read handlers can be wired generically instead of per-target IDs.
function renderTargetCell(key, value, editable, editingKeys) {
  if (!editable) return fmtMoney(value);

  const isEditing = editingKeys.has(key) || !value;
  if (!isEditing) {
    return `
      <div class="budget-target-view">
        <strong>${fmtMoney(value)}</strong>
        <button type="button" class="btn-icon target-edit-btn" data-key="${escapeHtml(key)}">${PENCIL_ICON}</button>
      </div>`;
  }
  return `
    <div class="budget-target-input">
      <input class="target-input" type="number" min="0" step="0.01" data-key="${escapeHtml(key)}" value="${value || ''}">
      <button class="btn-secondary target-save-btn" data-key="${escapeHtml(key)}">Enregistrer</button>
    </div>`;
}

function renderCategoryTable(categoryStats, editable, editingKeys) {
  if (!categoryStats.length) return '';
  return `
    <table class="admin-table">
      <thead>
        <tr><th>Catégorie</th><th>Cible</th><th>Engagé</th><th>Versé</th><th>Reste</th></tr>
      </thead>
      <tbody>
        ${categoryStats.map(c => `
          <tr>
            <td>${escapeHtml(c.category)}</td>
            <td>${renderTargetCell(`category:${c.category}`, c.target, editable, editingKeys)}</td>
            <td>${fmtMoney(c.engaged)}</td>
            <td>${fmtMoney(c.paid)}</td>
            <td>${fmtMoney(c.engaged - c.paid)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

export async function renderBudgetTab() {
  const panel = document.getElementById('tab-budget');
  document.getElementById('section-action').innerHTML = '';
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('budget');
  const editingKeys = new Set();

  let vendors, budgetDoc;
  try {
    [vendors, budgetDoc] = await Promise.all([loadVendors(), loadBudgetDoc()]);
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }
  let { target, categoryTargets } = budgetDoc;

  const totalEngaged = vendors
    .filter(v => ENGAGED_STATUSES.includes(v.status))
    .reduce((sum, v) => sum + (Number(v.total) || 0), 0);
  const totalPreferred = vendors
    .filter(v => v.status === 'candidat' && v.preferred)
    .reduce((sum, v) => sum + (Number(v.total) || 0), 0);
  const totalEstimated = totalEngaged + totalPreferred;
  const totalPaid = vendors
    .filter(v => ENGAGED_STATUSES.includes(v.status))
    .reduce((sum, v) => sum + paidAmount(v), 0);

  async function persistTarget(key, value) {
    if (key === 'global') {
      await saveTarget(value);
      target = value;
    } else {
      const category = key.slice('category:'.length);
      await saveCategoryTarget(category, categoryTargets, value);
      categoryTargets = { ...categoryTargets, [category]: value };
    }
  }

  function renderView() {
    const pct = target > 0 ? Math.min(100, Math.round((totalPaid / target) * 100)) : 0;
    const over = target > 0 && totalPaid > target;
    const categoryStats = computeCategoryStats(vendors, categoryTargets);
    const totalCategoryTargets = categoryStats.reduce((sum, c) => sum + c.target, 0);
    const categoryTargetsOverBudget = target > 0 && totalCategoryTargets > target;

    panel.innerHTML = `
      <div class="budget-summary">
        <div class="budget-summary-row">
          <span>Budget cible</span>
          ${renderTargetCell('global', target, editable, editingKeys)}
        </div>
        <div class="budget-summary-row">
          <span>Somme des cibles par catégorie</span>
          <strong class="${categoryTargetsOverBudget ? 'budget-over-text' : ''}">${fmtMoney(totalCategoryTargets)}</strong>
        </div>
        <div class="budget-summary-row"><span>Total engagé</span><strong>${fmtMoney(totalEngaged)}</strong></div>
        <div class="budget-summary-row"><span>Total estimé</span><strong>${fmtMoney(totalEstimated)}</strong></div>
        <div class="budget-summary-row"><span>Total versé</span><strong>${fmtMoney(totalPaid)}</strong></div>
        <div class="progress-bar"><div class="progress-bar-fill${over ? ' over' : ''}" style="width:${pct}%"></div></div>
        ${categoryTargetsOverBudget ? '<p class="budget-over-text budget-over-note">La somme des cibles par catégorie dépasse le budget cible global.</p>' : ''}
      </div>
      <h3 class="dashboard-subtitle">Par catégorie</h3>
      ${renderCategoryTable(categoryStats, editable, editingKeys)}`;

    if (!editable) return;

    panel.querySelectorAll('.target-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        editingKeys.add(btn.dataset.key);
        renderView();
      });
    });

    panel.querySelectorAll('.target-save-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.key;
        const input = panel.querySelector(`.target-input[data-key="${CSS.escape(key)}"]`);
        const value = Number(input.value) || 0;
        try {
          await persistTarget(key, value);
          editingKeys.delete(key);
          renderView();
        } catch (err) {
          alert(`Erreur : ${err.message}`);
        }
      });
    });
  }

  renderView();
}
