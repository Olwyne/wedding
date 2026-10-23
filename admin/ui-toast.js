// admin/ui-toast.js
// A plain-language, announced toast with an optional "Annuler" (undo) action.
// Used to give destructive actions a short grace window instead of being
// instant and irreversible.

let container = null;
function getContainer() {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-stack';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Shows a toast. If `onUndo` is given, a "Annuler" button appears and the
 * action is delayed by `duration` ms: `commit` fires only if the user does
 * not click undo in time. Without `onUndo`, it's a plain auto-dismissing
 * message (used for plain-language error/success text).
 */
export function showToast({ message, onUndo, commit, duration = 6000, tone = 'default' }) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${tone}`;
  toast.innerHTML = `
    <span class="toast-message">${escapeHtml(message)}</span>
    ${onUndo ? '<button type="button" class="toast-undo">Annuler</button>' : ''}`;
  getContainer().appendChild(toast);

  let cancelled = false;
  const timer = setTimeout(async () => {
    toast.remove();
    if (!cancelled && commit) await commit();
  }, duration);

  if (onUndo) {
    toast.querySelector('.toast-undo').addEventListener('click', () => {
      cancelled = true;
      clearTimeout(timer);
      toast.remove();
      onUndo();
    });
  } else {
    // plain message: let it auto-dismiss, no commit callback expected
  }
  return { dismiss: () => { clearTimeout(timer); toast.remove(); } };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
