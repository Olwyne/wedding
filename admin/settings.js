// admin/settings.js
import { db } from '../firebase-init.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';

const generalDocRef = doc(db, 'settings', 'general');

export async function loadChildrenAllowed() {
  try {
    const snap = await getDoc(generalDocRef);
    if (!snap.exists()) return true;
    const val = snap.data().childrenAllowed;
    if (val === false) return false;
    if (val === 'tolerated') return 'tolerated';
    return true;
  } catch (err) {
    console.error('loadChildrenAllowed failed', err);
    return true;
  }
}

async function saveChildrenAllowed(value) {
  await setDoc(generalDocRef, { childrenAllowed: value }, { merge: true });
}

export async function renderSettingsTab() {
  const panel = document.getElementById('tab-settings');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';
  document.getElementById('section-action').innerHTML = '';

  const editable = canWrite('settings');
  const childrenAllowed = await loadChildrenAllowed();

  panel.innerHTML = `
    <div class="settings-row">
      <div style="flex:1">
        <div class="settings-row-title">Enfants</div>
        <div class="settings-row-sub">Détermine comment les enfants apparaissent sur le formulaire public.</div>
      </div>
      <select id="setting-children-mode" ${editable ? '' : 'disabled'} style="min-width:220px">
        <option value="true" ${childrenAllowed === true ? 'selected' : ''}>Autorisés</option>
        <option value="tolerated" ${childrenAllowed === 'tolerated' ? 'selected' : ''}>Tolérés (suggestion de garde)</option>
        <option value="false" ${childrenAllowed === false ? 'selected' : ''}>Non autorisés</option>
      </select>
    </div>`;

  if (editable) {
    panel.querySelector('#setting-children-mode').addEventListener('change', async e => {
      e.target.disabled = true;
      try {
        const raw = e.target.value;
        const val = raw === 'false' ? false : raw === 'tolerated' ? 'tolerated' : true;
        await saveChildrenAllowed(val);
      } catch (err) {
        console.error('saveChildrenAllowed failed', err);
        alert(`Erreur : ${err.message}`);
      } finally {
        e.target.disabled = false;
      }
    });
  }
}
