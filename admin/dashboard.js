// admin/dashboard.js
import { loadGuests, computeStats, renderStatsBar } from './guests.js?v=9';
import { loadEvents } from './events.js?v=2';
import { canRead } from './permissions.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function computeEventStats(guests, events) {
  return events
    .map(ev => {
      let invited = 0, confirmed = 0;
      guests.forEach(g => {
        if (!(g.assignedEvents || []).includes(ev.id)) return;
        invited += (g.maxAdults ?? 1) + (g.maxChildren ?? 0);
        if (g.rsvp?.status === 'confirmed' && g.rsvp.confirmedEvents && g.rsvp.confirmedEvents[ev.id]) {
          confirmed += (g.rsvp.adults ?? 0) + (g.rsvp.children ?? 0);
        }
      });
      return { title: ev.title_fr, order: ev.order ?? 0, invited, confirmed };
    })
    .sort((a, b) => a.order - b.order);
}

function renderEventStats(eventStats) {
  if (!eventStats.length) return '';
  return `
    <h3 class="dashboard-subtitle">Par événement</h3>
    <table class="admin-table">
      <thead>
        <tr><th>Événement</th><th>Invités</th><th>Confirmés</th></tr>
      </thead>
      <tbody>
        ${eventStats.map(e => `
          <tr>
            <td>${escapeHtml(e.title)}</td>
            <td>${e.invited}</td>
            <td>${e.confirmed}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

export async function renderDashboardTab() {
  const panel = document.getElementById('tab-dashboard');
  document.getElementById('section-action').innerHTML = '';

  if (!canRead('guests')) {
    panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Bienvenue.</p>';
    return;
  }

  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  try {
    const [guests, events] = await Promise.all([loadGuests(), loadEvents()]);
    const stats = computeStats(guests);
    const eventStats = computeEventStats(guests, events);

    panel.innerHTML = `
      <h3 class="dashboard-subtitle">Invités</h3>
      ${renderStatsBar(stats)}
      ${renderEventStats(eventStats)}`;
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
  }
}
