// admin/script.js
import { initAuth } from './auth.js?v=1';
import { renderDashboardTab } from './dashboard.js?v=2';
import { renderBlocksTab } from './blocks.js?v=4';
import { renderGuestsTab } from './guests.js?v=3';
import { renderEventsTab } from './events.js?v=2';
import { renderUsersTab } from './users.js';
import { openAccountPanel } from './account.js';
import { canRead } from './permissions.js';
import { SECTIONS as PERM_SECTIONS } from './sections-registry.js';

const RENDER_BY_ID = {
  blocks: renderBlocksTab,
  guests: renderGuestsTab,
  events: renderEventsTab,
  users: renderUsersTab,
};

const NAV_SECTIONS = {
  dashboard: { title: 'Accueil', render: renderDashboardTab },
};
PERM_SECTIONS.forEach(s => {
  NAV_SECTIONS[s.id] = { title: s.label, render: RENDER_BY_ID[s.id] };
});

function updateNavVisibility() {
  PERM_SECTIONS.forEach(s => {
    const btn = document.querySelector(`.nav-item[data-section="${s.id}"]`);
    if (btn) btn.hidden = !canRead(s.id);
  });
}

function switchToSection(section) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = true; });
  document.getElementById('tab-' + section).hidden = false;
  document.getElementById('section-title').textContent = NAV_SECTIONS[section].title;
  NAV_SECTIONS[section].render().catch(err => console.error(err));
}

function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchToSection(btn.dataset.section));
  });
  document.getElementById('account-btn').addEventListener('click', openAccountPanel);
}

initNav();
initAuth({
  onSignedIn: () => {
    updateNavVisibility();
    switchToSection('dashboard');
  },
  onSignedOut: () => {},
});
