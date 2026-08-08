// admin/todo.js
import { canWrite } from './permissions.js';

export async function renderTodoTab() {
  const panel = document.getElementById('tab-todo');
  document.getElementById('section-action').innerHTML = '';
  const editable = canWrite('todo');
  panel.innerHTML = `<p style="padding:20px;color:var(--muted)">To-Do — à venir (editable: ${editable})</p>`;
}
