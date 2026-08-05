// admin/script.js
import { initAuth } from './auth.js';
import { renderDashboardTab } from './dashboard.js?v=1';
import { renderBlocksTab } from './blocks.js?v=3';
import { renderGuestsTab } from './guests.js?v=2';
import { renderEventsTab } from './events.js';

const SECTIONS = {
  dashboard: { title: 'Accueil', render: renderDashboardTab },
  blocks: { title: 'Blocs', render: renderBlocksTab },
  guests: { title: 'Invités', render: renderGuestsTab },
  events: { title: 'Événements', render: renderEventsTab },
};

function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = true; });
      const section = btn.dataset.section;
      document.getElementById('tab-' + section).hidden = false;
      document.getElementById('section-title').textContent = SECTIONS[section].title;
      SECTIONS[section].render();
    });
  });
}

initNav();
initAuth({
  onSignedIn: () => renderDashboardTab(),
  onSignedOut: () => {},
});
