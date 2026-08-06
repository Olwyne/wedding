// admin/budget.js
import { db } from '../firebase-init.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadVendors, paidAmount } from './vendors.js?v=4';
import { canWrite } from './permissions.js';

const budgetDocRef = doc(db, 'settings', 'budget');

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
  vendors.forEach(v => {
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

function renderCategoryTable(categoryStats, editable) {
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
            <td>${editable
              ? `<div class="budget-target-input">
                   <input class="category-target-input" type="number" min="0" step="0.01" data-category="${escapeHtml(c.category)}" value="${c.target || ''}">
                   <button class="btn-secondary category-target-save" data-category="${escapeHtml(c.category)}">Enregistrer</button>
                 </div>`
              : fmtMoney(c.target)}</td>
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

  let vendors, budgetDoc;
  try {
    [vendors, budgetDoc] = await Promise.all([loadVendors(), loadBudgetDoc()]);
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }
  const { target, categoryTargets } = budgetDoc;

  const totalEngaged = vendors.reduce((sum, v) => sum + (Number(v.total) || 0), 0);
  const totalPaid = vendors.reduce((sum, v) => sum + paidAmount(v), 0);
  const pct = target > 0 ? Math.min(100, Math.round((totalPaid / target) * 100)) : 0;
  const over = target > 0 && totalPaid > target;
  const categoryStats = computeCategoryStats(vendors, categoryTargets);

  panel.innerHTML = `
    <div class="budget-summary">
      <div class="budget-summary-row">
        <span>Budget cible</span>
        ${editable
          ? `<div class="budget-target-input">
               <input id="budget-target-input" type="number" min="0" step="0.01" value="${target || ''}">
               <button class="btn-secondary" id="budget-target-save">Enregistrer</button>
             </div>`
          : `<strong>${fmtMoney(target)}</strong>`}
      </div>
      <div class="budget-summary-row"><span>Total engagé</span><strong>${fmtMoney(totalEngaged)}</strong></div>
      <div class="budget-summary-row"><span>Total versé</span><strong>${fmtMoney(totalPaid)}</strong></div>
      <div class="progress-bar"><div class="progress-bar-fill${over ? ' over' : ''}" style="width:${pct}%"></div></div>
    </div>
    <h3 class="dashboard-subtitle">Par catégorie</h3>
    ${renderCategoryTable(categoryStats, editable) || '<p style="color:var(--muted)">Aucun prestataire.</p>'}`;

  if (editable) {
    panel.querySelector('#budget-target-save').addEventListener('click', async () => {
      const newTarget = Number(panel.querySelector('#budget-target-input').value) || 0;
      try {
        await saveTarget(newTarget);
        renderBudgetTab();
      } catch (err) {
        alert(`Erreur : ${err.message}`);
      }
    });
    panel.querySelectorAll('.category-target-save').forEach(btn => {
      btn.addEventListener('click', async () => {
        const category = btn.dataset.category;
        const input = panel.querySelector(`.category-target-input[data-category="${CSS.escape(category)}"]`);
        const value = Number(input.value) || 0;
        try {
          await saveCategoryTarget(category, categoryTargets, value);
          renderBudgetTab();
        } catch (err) {
          alert(`Erreur : ${err.message}`);
        }
      });
    });
  }
}
