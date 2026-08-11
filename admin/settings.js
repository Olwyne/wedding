// admin/settings.js
import { db } from '../firebase-init.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';

const generalDocRef = doc(db, 'settings', 'general');

export async function loadChildrenAllowed() {
  try {
    const snap = await getDoc(generalDocRef);
    return snap.exists() && snap.data().childrenAllowed === false ? false : true;
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
      <label class="toggle">
        <input type="checkbox" id="setting-children-allowed" ${childrenAllowed ? 'checked' : ''} ${editable ? '' : 'disabled'}>
        <span class="toggle-track"></span>
      </label>
      <div>
        <div class="settings-row-title">Enfants autorisés</div>
        <div class="settings-row-sub">Si désactivé, les champs enfants disparaissent du formulaire public et de la fiche invité.</div>
      </div>
    </div>`;

  if (editable) {
    panel.querySelector('#setting-children-allowed').addEventListener('change', async e => {
      e.target.disabled = true;
      try {
        await saveChildrenAllowed(e.target.checked);
      } catch (err) {
        console.error('saveChildrenAllowed failed', err);
        e.target.checked = !e.target.checked;
        alert(`Erreur : ${err.message}`);
      } finally {
        e.target.disabled = false;
      }
    });
  }
}
