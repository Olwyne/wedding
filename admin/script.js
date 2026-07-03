// admin/script.js
import { initAuth } from './auth.js';

function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
      document.getElementById('tab-' + btn.dataset.tab).hidden = false;
    });
  });
}

initTabs();
initAuth({
  onSignedIn: () => {},
  onSignedOut: () => {},
});
