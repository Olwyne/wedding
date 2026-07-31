// admin/script.js
import { initAuth } from './auth.js';
import { renderBlocksTab } from './blocks.js';
import { renderGuestsTab } from './guests.js';
import { renderEventsTab } from './events.js';

const SECTIONS = {
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
  onSignedIn: () => renderBlocksTab(),
  onSignedOut: () => {},
});
