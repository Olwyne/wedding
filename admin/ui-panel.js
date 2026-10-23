// admin/ui-panel.js
// Shared mount/dismiss behavior for the side panels used across the backoffice
// (guests, blocks, events, vendors, users, etc.): dialog semantics, a focus
// trap, Escape-to-close, and focus restored to whatever opened the panel.
// Mirrors the keyboard contract already implemented in ui-confirm.js.

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'textarea:not([disabled])',
  'input:not([disabled])', 'select:not([disabled])', '[tabindex]:not([tabindex="-1"])'
].join(',');

let labelIdSeq = 0;

/**
 * Appends overlay + panelEl to the document, wires dialog semantics onto
 * panelEl, moves focus in, traps Tab, and closes on Escape.
 *
 * `closeFn` is the panel's own close handler (the one already wired to the
 * close button, cancel button, and overlay click) — pass the version that
 * already applies any in-flight-save guard the panel needs.
 *
 * Returns `teardown()`, which the panel's close handler must call before (or
 * while) removing overlay/panelEl, so focus returns to the trigger and the
 * keydown listener is released.
 */
export function mountPanel(overlay, panelEl, closeFn) {
  const previouslyFocused = document.activeElement;

  panelEl.setAttribute('role', 'dialog');
  panelEl.setAttribute('aria-modal', 'true');
  if (!panelEl.hasAttribute('tabindex')) panelEl.setAttribute('tabindex', '-1');

  const heading = panelEl.querySelector('.panel-header h3, .panel-header h2, h3, h2');
  if (heading) {
    if (!heading.id) heading.id = `panel-heading-${++labelIdSeq}`;
    panelEl.setAttribute('aria-labelledby', heading.id);
  }

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function focusable() {
    return Array.from(panelEl.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter(el => el.offsetParent !== null);
  }

  (focusable()[0] || panelEl).focus();

  function onKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeFn(); return; }
    if (e.key === 'Tab') {
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  }
  document.addEventListener('keydown', onKeydown);

  return function teardown() {
    document.removeEventListener('keydown', onKeydown);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function' && document.contains(previouslyFocused)) {
      previouslyFocused.focus();
    }
  };
}
