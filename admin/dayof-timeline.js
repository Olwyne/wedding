// admin/dayof-timeline.js
export const DAY_START_MIN = 6 * 60;   // 06:00
export const DAY_END_MIN = 24 * 60;    // 24:00
export const PX_PER_MIN = 2;
export const SNAP_MIN = 15;
export const DEFAULT_DURATION_MIN = 30;

export function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(min) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hourMarkers() {
  const rows = [];
  for (let min = DAY_START_MIN; min < DAY_END_MIN; min += 60) {
    rows.push(`<div class="timeline-hour" style="top:${(min - DAY_START_MIN) * PX_PER_MIN}px">${minutesToTime(min)}</div>`);
  }
  return rows.join('');
}

export function renderTimelineGrid(container, lanes, items, onBlockClick, editable) {
  const gridHeight = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;
  container.innerHTML = `
    <div class="timeline-grid" style="grid-template-columns:60px repeat(${lanes.length}, 1fr)">
      <div class="timeline-axis-header"></div>
      ${lanes.map(l => `<div class="timeline-lane-header" style="border-top-color:${l.color}">${l.label ? l.label.replace(/</g, '&lt;') : ''}</div>`).join('')}
      <div class="timeline-axis" style="height:${gridHeight}px">${hourMarkers()}</div>
      ${lanes.map(l => `<div class="timeline-lane-col" data-lane-id="${l.id}" style="height:${gridHeight}px"></div>`).join('')}
    </div>`;
}
