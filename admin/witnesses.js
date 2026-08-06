// admin/witnesses.js
import { canWrite } from './permissions.js';

export async function renderWitnessesTab() {
  const panel = document.getElementById('tab-witnesses');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';
  document.getElementById('section-action').innerHTML = '';

  const editable = canWrite('witnesses');
  panel.innerHTML = `<p style="padding:20px;color:var(--muted)">Témoins — à venir (editable: ${editable})</p>`;
}
