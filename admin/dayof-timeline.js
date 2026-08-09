// admin/dayof-timeline.js
import { GENERAL_LANE_ID } from './timeline-lanes.js?v=1';

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

function escapeHtmlLocal(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function blocksHtmlForLane(lane, items) {
  return items
    .filter(item => (item.laneId || GENERAL_LANE_ID) === lane.id)
    .map(item => {
      const startMin = timeToMinutes(item.time);
      const endMin = item.endTime ? timeToMinutes(item.endTime) : startMin + DEFAULT_DURATION_MIN;
      const durationMin = Math.max(SNAP_MIN, endMin - startMin);
      const top = (startMin - DAY_START_MIN) * PX_PER_MIN;
      const height = durationMin * PX_PER_MIN;
      return `
        <div class="timeline-block" data-item-id="${item.id}" style="top:${top}px;height:${height}px;background:${lane.color}33;border-left-color:${lane.color}">
          <div class="timeline-block-title">${escapeHtmlLocal(item.title)}</div>
          <div class="timeline-block-time">${escapeHtmlLocal(item.time)}–${escapeHtmlLocal(minutesToTime(endMin))}</div>
          <div class="timeline-resize-handle"></div>
        </div>`;
    }).join('');
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
  let activeLaneId = lanes[0]?.id;

  container.innerHTML = `
    <div class="timeline-mobile-tabs">
      ${lanes.map(l => `<button class="timeline-tab ${l.id === activeLaneId ? 'active' : ''}" data-lane-id="${l.id}">${escapeHtmlLocal(l.label)}</button>`).join('')}
    </div>
    <div class="timeline-grid" style="grid-template-columns:60px repeat(${lanes.length}, 1fr)">
      <div class="timeline-axis-header"></div>
      ${lanes.map(l => `<div class="timeline-lane-header" data-lane-id="${l.id}" style="border-top-color:${l.color}">${escapeHtmlLocal(l.label)}</div>`).join('')}
      <div class="timeline-axis" style="height:${gridHeight}px">${hourMarkers()}</div>
      ${lanes.map(l => `<div class="timeline-lane-col" data-lane-id="${l.id}" style="height:${gridHeight}px">${blocksHtmlForLane(l, items)}</div>`).join('')}
    </div>`;

  function applyMobileFilter() {
    container.querySelectorAll('.timeline-lane-header, .timeline-lane-col').forEach(el => {
      el.classList.toggle('timeline-mobile-hidden', el.dataset.laneId !== activeLaneId);
    });
    container.querySelectorAll('.timeline-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.laneId === activeLaneId);
    });
  }

  container.querySelectorAll('.timeline-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeLaneId = tab.dataset.laneId;
      applyMobileFilter();
    });
  });

  applyMobileFilter();
}
