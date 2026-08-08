// admin/calendar.js
import { canWrite } from './permissions.js';

export async function renderCalendarTab() {
  const panel = document.getElementById('tab-calendar');
  document.getElementById('section-action').innerHTML = '';
  const editable = canWrite('calendar');
  panel.innerHTML = `<p style="padding:20px;color:var(--muted)">Calendrier — à venir (editable: ${editable})</p>`;
}
