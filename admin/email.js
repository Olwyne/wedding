// admin/email.js
import { auth } from '../firebase-init.js';

const TYPE_LABELS = {
  relance: 'relance',
  rappel: 'rappel J',
  account: 'accès admin',
};

const TYPE_SUBJECTS = {
  relance: 'Sophie & Sob – Nous attendons votre réponse 💌',
  rappel: 'Sophie & Sob – On se retrouve bientôt ! 🎉',
  account: 'Accès admin – Site de mariage Sophie & Sob',
};

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function buildRecipientList(recipients) {
  if (recipients.length === 1) {
    const r = recipients[0];
    return `<p><strong>${escapeHtml(r.name)}</strong> (${escapeHtml(r.email)})</p>`;
  }
  const items = recipients
    .slice(0, 20)
    .map(r => `<li>${escapeHtml(r.name)} (${escapeHtml(r.email)})</li>`)
    .join('');
  const more = recipients.length > 20
    ? `<li style="color:var(--muted)">… et ${recipients.length - 20} autres</li>`
    : '';
  return `<ul style="max-height:200px;overflow-y:auto;margin:8px 0;padding-left:20px">${items}${more}</ul>`;
}

async function doSend(type, recipients) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch('/api/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ type, recipients, origin: location.origin }),
  });
  if (res.status === 401) throw new Error('Session expirée, rechargez la page.');
  if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);
  return res.json();
}

export function sendEmailWithConfirm(type, recipients) {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    const modal = document.createElement('div');
    modal.className = 'panel';
    modal.style.maxWidth = '480px';

    const label = TYPE_LABELS[type] || type;
    const subject = TYPE_SUBJECTS[type] || '';
    const count = recipients.length;
    const title = count === 1
      ? `Envoyer un email de ${label} à :`
      : `Envoyer un email de ${label} à ${count} invités :`;

    modal.innerHTML = `
      <div class="panel-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="btn-icon" id="email-modal-close">✕</button>
      </div>
      <div class="panel-body">
        ${buildRecipientList(recipients)}
        ${subject ? `<p style="color:var(--muted);font-size:13px">Sujet : <em>${escapeHtml(subject)}</em></p>` : ''}
        <p id="email-modal-result" style="display:none"></p>
      </div>
      <div class="panel-footer">
        <button class="btn-primary" id="email-modal-send">Envoyer${count > 1 ? ' à tous' : ''}</button>
        <button class="btn-secondary" id="email-modal-cancel">Annuler</button>
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    function close(result) {
      overlay.remove();
      modal.remove();
      if (result !== undefined) resolve(result);
      else reject(new Error('cancelled'));
    }

    modal.querySelector('#email-modal-close').addEventListener('click', () => close());
    modal.querySelector('#email-modal-cancel').addEventListener('click', () => close());
    overlay.addEventListener('click', () => close());

    modal.querySelector('#email-modal-send').addEventListener('click', async () => {
      const sendBtn = modal.querySelector('#email-modal-send');
      const cancelBtn = modal.querySelector('#email-modal-cancel');
      const resultEl = modal.querySelector('#email-modal-result');

      sendBtn.disabled = true;
      cancelBtn.disabled = true;
      sendBtn.textContent = 'Envoi…';
      resultEl.style.display = 'none';

      try {
        const result = await doSend(type, recipients);
        const failText = result.failed.length
          ? ` · ${result.failed.length} échec(s)`
          : '';
        resultEl.textContent = `✓ ${result.sent} email(s) envoyé(s)${failText}`;
        resultEl.style.color = result.failed.length ? 'var(--warning, orange)' : 'var(--success, green)';
        resultEl.style.display = 'block';
        sendBtn.textContent = 'Fermer';
        sendBtn.disabled = false;
        cancelBtn.style.display = 'none';
        sendBtn.onclick = () => close(result);
      } catch (err) {
        resultEl.textContent = `Erreur : ${err.message}`;
        resultEl.style.color = 'var(--danger)';
        resultEl.style.display = 'block';
        sendBtn.textContent = 'Envoyer';
        sendBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });
  });
}
