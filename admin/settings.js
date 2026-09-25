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

async function loadSettings() {
  try {
    const snap = await getDoc(generalDocRef);
    if (!snap.exists()) return {};
    return snap.data();
  } catch (err) {
    console.error('loadSettings failed', err);
    return {};
  }
}

export async function renderSettingsTab() {
  const panel = document.getElementById('tab-settings');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';
  document.getElementById('section-action').innerHTML = '';

  const editable = canWrite('settings');
  const settings = await loadSettings();
  const childrenAllowed = settings.childrenAllowed === false ? false : settings.childrenAllowed === 'tolerated' ? 'tolerated' : true;
  const rsvpDeadline = settings.rsvpDeadline || '';
  const hideAddresses = !!settings.hideAddresses;

  // Convert stored ISO string to local datetime-local value (YYYY-MM-DDTHH:MM)
  let deadlineInputVal = '';
  if (rsvpDeadline) {
    try {
      const d = new Date(rsvpDeadline);
      const pad = n => String(n).padStart(2, '0');
      deadlineInputVal = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (_) {}
  }

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
    </div>
    <div class="settings-row">
      <div style="flex:1">
        <div class="settings-row-title">Cacher les adresses</div>
        <div class="settings-row-sub">Remplace les adresses et liens de carte par un message indiquant que les lieux seront communiqués par mail.</div>
      </div>
      <label class="settings-toggle">
        <input type="checkbox" id="setting-hide-addresses" ${editable ? '' : 'disabled'} ${hideAddresses ? 'checked' : ''}>
        <span class="settings-toggle-label">${hideAddresses ? 'Activé' : 'Désactivé'}</span>
      </label>
    </div>
    <div class="settings-row">
      <div style="flex:1">
        <div class="settings-row-title">Date limite RSVP</div>
        <div class="settings-row-sub">Après cette date, le formulaire public affiche un message de clôture. Laisser vide pour désactiver.</div>
      </div>
      <input type="datetime-local" id="setting-rsvp-deadline" ${editable ? '' : 'disabled'} style="min-width:220px" value="${deadlineInputVal}">
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

    panel.querySelector('#setting-hide-addresses').addEventListener('change', async e => {
      e.target.disabled = true;
      const label = e.target.nextElementSibling;
      try {
        await setDoc(generalDocRef, { hideAddresses: e.target.checked }, { merge: true });
        if (label) label.textContent = e.target.checked ? 'Activé' : 'Désactivé';
      } catch (err) {
        console.error('saveHideAddresses failed', err);
        alert(`Erreur : ${err.message}`);
      } finally {
        e.target.disabled = false;
      }
    });

    panel.querySelector('#setting-rsvp-deadline').addEventListener('change', async e => {
      e.target.disabled = true;
      try {
        const val = e.target.value ? new Date(e.target.value).toISOString() : null;
        await setDoc(generalDocRef, { rsvpDeadline: val }, { merge: true });
      } catch (err) {
        console.error('saveRsvpDeadline failed', err);
        alert(`Erreur : ${err.message}`);
      } finally {
        e.target.disabled = false;
      }
    });
  }
}
