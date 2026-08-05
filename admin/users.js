// admin/users.js
import { db, auth } from '../firebase-init.js';
import {
  collection, getDocs, doc, setDoc, updateDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  initializeApp, deleteApp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getAuth, createUserWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { firebaseConfig } from '../firebase-config.js';
import { SECTIONS } from './sections-registry.js';
import { canWrite } from './permissions.js';

const adminsCol = collection(db, 'admins');
const LEVEL_LABELS = { none: 'Aucun', read: 'Lecture', write: 'Modification' };

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let pw = '';
  for (let i = 0; i < length; i++) pw += chars[bytes[i] % chars.length];
  return pw;
}

async function loadUsers() {
  const snap = await getDocs(adminsCol);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function permSummary(permissions) {
  return SECTIONS
    .map(s => `${s.label}: ${LEVEL_LABELS[permissions?.[s.id] || 'none']}`)
    .join(' · ');
}

function renderUserRow(u, editable) {
  return `
    <tr>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(permSummary(u.permissions))}</td>
      <td>${editable
        ? `<div class="table-actions"><button class="btn-secondary btn-edit-user" data-id="${escapeHtml(u.id)}">Modifier</button></div>`
        : ''}</td>
    </tr>`;
}

export async function renderUsersTab() {
  const panel = document.getElementById('tab-users');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('users');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-user-btn" class="btn-primary">+ Inviter un utilisateur</button>'
    : '';

  let users;
  try {
    users = await loadUsers();
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }

  panel.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr><th>Email</th><th>Permissions</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${users.length
          ? users.map(u => renderUserRow(u, editable)).join('')
          : '<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:40px">Aucun utilisateur.</td></tr>'}
      </tbody>
    </table>`;

  if (editable) {
    document.getElementById('add-user-btn').addEventListener('click', () => openUserPanel(null, users));
    panel.querySelectorAll('.btn-edit-user').forEach(btn =>
      btn.addEventListener('click', () => openUserPanel(btn.dataset.id, users))
    );
  }
}

function renderPermissionFields(permissions, lockUsersField) {
  return SECTIONS.map(s => {
    const current = permissions?.[s.id] || 'none';
    const locked = lockUsersField && s.id === 'users';
    return `
      <label class="field">
        <span>${escapeHtml(s.label)}</span>
        <select id="perm-${s.id}" ${locked ? 'disabled' : ''}>
          ${['none', 'read', 'write'].map(level =>
            `<option value="${level}" ${current === level ? 'selected' : ''}>${LEVEL_LABELS[level]}</option>`
          ).join('')}
        </select>
        ${locked ? '<span style="color:var(--muted);font-size:11px">Vous ne pouvez pas modifier vos propres droits sur Utilisateurs.</span>' : ''}
      </label>`;
  }).join('');
}

async function createAuthAccount(email, password) {
  const secondaryApp = initializeApp(firebaseConfig, 'secondary-' + Date.now());
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await signOut(secondaryAuth);
    return cred.user.uid;
  } finally {
    await deleteApp(secondaryApp);
  }
}

function openUserPanel(id, users) {
  const user = id ? users.find(u => u.id === id) : null;
  const isNew = !user;
  const generatedPassword = isNew ? generatePassword() : null;
  const lockUsersField = !isNew && user.id === auth.currentUser?.uid;

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${isNew ? 'Inviter un utilisateur' : 'Modifier les permissions'}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      ${isNew ? `
        <label class="field">
          <span>Email</span>
          <input id="user-email" type="email" required>
        </label>
        <div class="field">
          <span>Mot de passe temporaire (généré)</span>
          <div class="password-reveal">
            <code id="user-password">${escapeHtml(generatedPassword)}</code>
            <button type="button" class="btn-secondary" id="copy-password">Copier</button>
          </div>
        </div>` : `
        <div class="field"><span>Email</span><div>${escapeHtml(user.email)}</div></div>`}
      ${renderPermissionFields(user?.permissions, lockUsersField)}
      <p id="user-error" class="login-error" hidden></p>
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">${isNew ? 'Créer' : 'Enregistrer'}</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function isSaving() { return !!panelEl.querySelector('#panel-save')?.disabled; }
  function close() { overlay.remove(); panelEl.remove(); renderUsersTab(); }
  panelEl.querySelector('#panel-close').addEventListener('click', () => { if (!isSaving()) close(); });
  panelEl.querySelector('#panel-cancel').addEventListener('click', () => { if (!isSaving()) close(); });
  overlay.addEventListener('click', () => { if (!isSaving()) close(); });

  if (isNew) {
    panelEl.querySelector('#copy-password').addEventListener('click', async () => {
      await navigator.clipboard.writeText(generatedPassword);
      panelEl.querySelector('#copy-password').textContent = 'Copié !';
    });
  }

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const saveBtn = panelEl.querySelector('#panel-save');
    saveBtn.disabled = true;
    saveBtn.textContent = isNew ? 'Création…' : 'Enregistrement…';

    const permissions = {};
    SECTIONS.forEach(s => {
      permissions[s.id] = panelEl.querySelector(`#perm-${s.id}`).value;
    });

    const errorEl = panelEl.querySelector('#user-error');
    errorEl.hidden = true;
    let createdUid = null;

    try {
      if (isNew) {
        const email = panelEl.querySelector('#user-email').value.trim();
        if (!email) throw new Error('no-email');
        const uid = await createAuthAccount(email, generatedPassword);
        createdUid = uid;
        await setDoc(doc(db, 'admins', uid), {
          email,
          permissions,
          createdAt: new Date().toISOString(),
          createdBy: auth.currentUser.uid,
        });
      } else {
        await updateDoc(doc(db, 'admins', id), { permissions });
      }
      close();
    } catch (err) {
      console.error(err);
      if (createdUid) {
        errorEl.textContent = `Compte créé mais échec de l'enregistrement des permissions (uid: ${createdUid}). Contactez-vous-même via la console Firebase pour finaliser ou supprimer ce compte.`;
      } else {
        errorEl.textContent = `Erreur : ${err.message}`;
      }
      errorEl.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = isNew ? 'Créer' : 'Enregistrer';
    }
  });
}
