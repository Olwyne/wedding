import { auth } from '../firebase-init.js';
import {
  EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function openAccountPanel() {
  const user = auth.currentUser;

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>Mon compte</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="field"><span>Email</span><div>${escapeHtml(user.email)}</div></div>
      <label class="field">
        <span>Mot de passe actuel</span>
        <input id="acc-current-pw" type="password" required>
      </label>
      <label class="field">
        <span>Nouveau mot de passe</span>
        <input id="acc-new-pw" type="password" required minlength="6">
      </label>
      <label class="field">
        <span>Confirmer le nouveau mot de passe</span>
        <input id="acc-confirm-pw" type="password" required minlength="6">
      </label>
      <p id="acc-error" class="login-error" hidden></p>
      <p id="acc-success" hidden style="color:#15803d;font-size:13px">Mot de passe mis à jour.</p>
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">Mettre à jour</button>
      <button class="btn-secondary" id="panel-cancel">Fermer</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const errorEl = panelEl.querySelector('#acc-error');
    const successEl = panelEl.querySelector('#acc-success');
    errorEl.hidden = true;
    successEl.hidden = true;

    const currentPw = panelEl.querySelector('#acc-current-pw').value;
    const newPw = panelEl.querySelector('#acc-new-pw').value;
    const confirmPw = panelEl.querySelector('#acc-confirm-pw').value;

    if (newPw !== confirmPw) {
      errorEl.textContent = 'Les mots de passe ne correspondent pas.';
      errorEl.hidden = false;
      return;
    }

    if (newPw.length < 6) {
      errorEl.textContent = 'Le mot de passe doit faire au moins 6 caractères.';
      errorEl.hidden = false;
      return;
    }

    const saveBtn = panelEl.querySelector('#panel-save');
    saveBtn.disabled = true;
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);
      successEl.hidden = false;
      panelEl.querySelector('#acc-current-pw').value = '';
      panelEl.querySelector('#acc-new-pw').value = '';
      panelEl.querySelector('#acc-confirm-pw').value = '';
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorEl.textContent = 'Mot de passe actuel incorrect.';
      } else if (err.code === 'auth/weak-password') {
        errorEl.textContent = 'Le nouveau mot de passe est trop court (6 caractères minimum).';
      } else {
        errorEl.textContent = 'Erreur : réessayez.';
      }
      errorEl.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });
}
