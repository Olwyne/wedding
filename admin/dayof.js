// admin/dayof.js
import { canWrite } from './permissions.js';

export async function renderDayOfTab() {
  const panel = document.getElementById('tab-dayof');
  document.getElementById('section-action').innerHTML = '';
  const editable = canWrite('dayof');
  panel.innerHTML = `<p style="padding:20px;color:var(--muted)">Déroulé jour-J — à venir (editable: ${editable})</p>`;
}
