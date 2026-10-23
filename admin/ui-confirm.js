// admin/ui-confirm.js
// Replaces native confirm()/alert() with dialogs that match the product's own
// panel visual language and are announced to assistive tech.

/**
 * Shows a centered confirm dialog. Resolves true/false. Keyboard: Esc cancels,
 * Enter confirms, focus is trapped and restored on close.
 */
export function confirmDialog({ title, message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false } = {}) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <h3 id="confirm-title">${escapeHtml(title || 'Confirmer')}</h3>
        <p id="confirm-message">${escapeHtml(message || '')}</p>
        <div class="confirm-actions">
          <button type="button" class="btn-secondary confirm-cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="${danger ? 'btn-danger' : 'btn-primary'} confirm-ok">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const dialog = overlay.querySelector('.confirm-dialog');
    const okBtn = overlay.querySelector('.confirm-ok');
    const cancelBtn = overlay.querySelector('.confirm-cancel');

    function close(result) {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      resolve(result);
    }
    function onKeydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      if (e.key === 'Enter') { e.preventDefault(); close(true); }
      if (e.key === 'Tab') {
        const focusable = [cancelBtn, okBtn];
        const idx = focusable.indexOf(document.activeElement);
        e.preventDefault();
        const next = e.shiftKey ? (idx <= 0 ? focusable.length - 1 : idx - 1) : (idx === focusable.length - 1 ? 0 : idx + 1);
        focusable[next].focus();
      }
    }
    okBtn.addEventListener('click', () => close(true));
    cancelBtn.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKeydown);
    okBtn.focus();
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
