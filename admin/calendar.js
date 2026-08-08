// admin/calendar.js
import { db } from '../firebase-init.js';
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { canWrite } from './permissions.js';
import { loadTasks, openTaskPanel } from './tasks-shared.js?v=2';

const FC_SRC = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js';
const FC_LOCALES_SRC = 'https://cdn.jsdelivr.net/npm/@fullcalendar/core@6.1.15/locales-all.global.min.js';

const STATUS_COLOR = { todo: '#9ca3af', in_progress: '#f59e0b', done: '#16a34a' };

let calendarInstance = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Échec de chargement de ${src}`));
    document.head.appendChild(script);
  });
}

function loadFullCalendar() {
  if (window.FullCalendar) return Promise.resolve();
  if (!window.__fcLoadPromise) {
    window.__fcLoadPromise = loadScript(FC_SRC).then(() => loadScript(FC_LOCALES_SRC));
  }
  return window.__fcLoadPromise;
}

export async function renderCalendarTab() {
  const panel = document.getElementById('tab-calendar');
  document.getElementById('section-action').innerHTML = '';
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  try {
    await loadFullCalendar();
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${err.message}</p>`;
    return;
  }

  const editable = canWrite('calendar');
  const tasks = await loadTasks();
  const dueTasks = tasks.filter(t => t.dueDate);

  panel.innerHTML = '<div id="calendar-root"></div>';
  const root = document.getElementById('calendar-root');

  if (calendarInstance) {
    calendarInstance.destroy();
    calendarInstance = null;
  }

  calendarInstance = new window.FullCalendar.Calendar(root, {
    initialView: 'dayGridMonth',
    height: 'auto',
    locale: 'fr',
    firstDay: 1,
    editable,
    events: dueTasks.map(t => ({
      id: t.id,
      title: t.title,
      start: t.dueDate,
      allDay: true,
      color: STATUS_COLOR[t.status] || STATUS_COLOR.todo,
      textColor: '#fff',
    })),
    eventClick: (info) => {
      openTaskPanel(info.event.id, tasks, { onSaved: renderCalendarTab, readOnly: !editable });
    },
    dateClick: (info) => {
      if (!editable) return;
      openTaskPanel(null, tasks, { onSaved: renderCalendarTab, defaults: { dueDate: info.dateStr } });
    },
    eventDrop: async (info) => {
      const newDue = info.event.startStr.slice(0, 10);
      try {
        await updateDoc(doc(db, 'tasks', info.event.id), { dueDate: newDue });
        const task = tasks.find(t => t.id === info.event.id);
        if (task) task.dueDate = newDue;
      } catch (err) {
        console.error(err);
        info.revert();
      }
    },
  });

  calendarInstance.render();
}
