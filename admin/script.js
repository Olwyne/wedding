// admin/script.js
import { initAuth } from './auth.js?v=1';
import { renderDashboardTab } from './dashboard.js?v=3';
import { renderBlocksTab } from './blocks.js?v=7';
import { renderGuestsTab } from './guests.js?v=5';
import { renderTablesTab } from './tables.js?v=1';
import { renderVendorsTab } from './vendors.js?v=6';
import { renderBudgetTab } from './budget.js?v=6';
import { renderEventsTab } from './events.js?v=4';
import { renderDayOfTab } from './dayof.js?v=2';
import { renderTodoTab } from './todo.js?v=1';
import { renderCalendarTab } from './calendar.js?v=1';
import { renderUsersTab } from './users.js?v=1';
import { renderWitnessesTab } from './witnesses.js?v=3';
import { openAccountPanel } from './account.js';
import { canRead } from './permissions.js';
import { SECTIONS as PERM_SECTIONS } from './sections-registry.js?v=1';

const RENDER_BY_ID = {
  blocks: renderBlocksTab,
  vendors: renderVendorsTab,
  budget: renderBudgetTab,
  guests: renderGuestsTab,
  tables: renderTablesTab,
  witnesses: renderWitnessesTab,
  events: renderEventsTab,
  dayof: renderDayOfTab,
  todo: renderTodoTab,
  calendar: renderCalendarTab,
  users: renderUsersTab,
};

const NAV_SECTIONS = {
  dashboard: { title: 'Accueil', render: renderDashboardTab },
};
PERM_SECTIONS.forEach(s => {
  NAV_SECTIONS[s.id] = { title: s.label, render: RENDER_BY_ID[s.id] };
});

const SLUG_BY_SECTION = { dashboard: 'dashboard', blocks: 'content', vendors: 'vendors', budget: 'budget', guests: 'guest', tables: 'tables', witnesses: 'witnesses', events: 'events', dayof: 'dayof', todo: 'todo', calendar: 'calendar', users: 'users' };
const SECTION_BY_SLUG = Object.fromEntries(Object.entries(SLUG_BY_SECTION).map(([section, slug]) => [slug, section]));

function sectionFromPath() {
  const slug = location.pathname.replace(/^\/admin\/?/, '').replace(/\/$/, '');
  return SECTION_BY_SLUG[slug] || 'dashboard';
}

function updateNavVisibility() {
  PERM_SECTIONS.forEach(s => {
    const btn = document.querySelector(`.nav-item[data-section="${s.id}"]`);
    if (btn) btn.hidden = !canRead(s.id);
  });
}

function switchToSection(section, { push = true } = {}) {
  if (!NAV_SECTIONS[section]) section = 'dashboard';
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = true; });
  document.getElementById('tab-' + section).hidden = false;
  document.getElementById('section-title').textContent = NAV_SECTIONS[section].title;
  NAV_SECTIONS[section].render().catch(err => console.error(err));

  const url = `/admin/${SLUG_BY_SECTION[section]}/`;
  if (push && location.pathname !== url) history.pushState({ section }, '', url);
}

function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchToSection(btn.dataset.section));
  });
  document.getElementById('account-btn').addEventListener('click', openAccountPanel);
  window.addEventListener('popstate', () => switchToSection(sectionFromPath(), { push: false }));
}

initNav();
initAuth({
  onSignedIn: () => {
    updateNavVisibility();
    switchToSection(sectionFromPath(), { push: false });
  },
  onSignedOut: () => {},
});
