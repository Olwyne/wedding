// admin/dayof-timeline.js
import { GENERAL_LANE_ID } from './timeline-lanes.js?v=2';

export const DAY_START_MIN = 0;        // 00:00
export const DAY_END_MIN = 24 * 60;    // 24:00
export const PX_PER_MIN = 2;
export const SNAP_MIN = 15;
export const DEFAULT_DURATION_MIN = 30;

let activeLaneId = null;

export function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(min) {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(min)));
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

export function renderTimelineGrid(container, lanes, items, { onBlockClick, onItemMoved, editable }) {
  const gridHeight = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;
  if (!lanes.some(l => l.id === activeLaneId)) {
    activeLaneId = lanes[0]?.id;
  }

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

  if (editable) {
    container.querySelectorAll('.timeline-block').forEach(block => {
      attachDragHandlers(block, items, onItemMoved, onBlockClick);
    });
  } else {
    container.querySelectorAll('.timeline-block').forEach(block => {
      block.style.cursor = 'default';
      const handle = block.querySelector('.timeline-resize-handle');
      if (handle) handle.style.cursor = 'default';
    });
  }
}

function attachDragHandlers(block, items, onItemMoved, onBlockClick) {
  const itemId = block.dataset.itemId;

  block.addEventListener('pointerdown', (e) => {
    if (e.target.classList.contains('timeline-resize-handle')) return;
    e.preventDefault();
    const item = items.find(i => i.id === itemId);
    const startY = e.clientY;
    const startMin = timeToMinutes(item.time);
    const endMin = item.endTime ? timeToMinutes(item.endTime) : startMin + DEFAULT_DURATION_MIN;
    const durationMin = Math.max(SNAP_MIN, endMin - startMin);
    let moved = false;
    let finalStartMin = startMin;
    const pointerId = e.pointerId;

    block.setPointerCapture(e.pointerId);

    function onPointerMove(ev) {
      if (ev.pointerId !== pointerId) return;
      const deltaPx = ev.clientY - startY;
      if (Math.abs(deltaPx) > 3) moved = true;
      const deltaMinRaw = deltaPx / PX_PER_MIN;
      const snappedDelta = Math.round(deltaMinRaw / SNAP_MIN) * SNAP_MIN;
      let newStart = startMin + snappedDelta;
      newStart = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - durationMin, newStart));
      finalStartMin = newStart;
      block.style.top = `${(newStart - DAY_START_MIN) * PX_PER_MIN}px`;
    }

    function onPointerUp(ev) {
      if (ev.pointerId !== pointerId) return;
      block.removeEventListener('pointermove', onPointerMove);
      block.removeEventListener('pointerup', onPointerUp);
      block.removeEventListener('pointercancel', onPointerUp);
      if (moved && finalStartMin !== startMin) {
        onItemMoved(itemId, minutesToTime(finalStartMin), minutesToTime(finalStartMin + durationMin));
      } else if (!moved) {
        onBlockClick(itemId);
      }
    }

    block.addEventListener('pointermove', onPointerMove);
    block.addEventListener('pointerup', onPointerUp);
    block.addEventListener('pointercancel', onPointerUp);
  });

  const handle = block.querySelector('.timeline-resize-handle');
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const item = items.find(i => i.id === itemId);
    const startY = e.clientY;
    const startMin = timeToMinutes(item.time);
    const initialEndMin = item.endTime ? timeToMinutes(item.endTime) : startMin + DEFAULT_DURATION_MIN;
    let finalEndMin = initialEndMin;
    const pointerId = e.pointerId;

    handle.setPointerCapture(e.pointerId);

    function onPointerMove(ev) {
      if (ev.pointerId !== pointerId) return;
      const deltaPx = ev.clientY - startY;
      const deltaMinRaw = deltaPx / PX_PER_MIN;
      const snappedDelta = Math.round(deltaMinRaw / SNAP_MIN) * SNAP_MIN;
      let newEnd = initialEndMin + snappedDelta;
      newEnd = Math.max(startMin + SNAP_MIN, Math.min(DAY_END_MIN, newEnd));
      finalEndMin = newEnd;
      block.style.height = `${(newEnd - startMin) * PX_PER_MIN}px`;
    }

    function onPointerUp(ev) {
      if (ev.pointerId !== pointerId) return;
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerUp);
      handle.removeEventListener('pointercancel', onPointerUp);
      if (finalEndMin !== initialEndMin) {
        // Clamp to 23:59 so the value round-trips through <input type="time">,
        // which rejects "24:00" and silently reads back as "".
        const clampedEndMin = Math.min(finalEndMin, DAY_END_MIN - 1);
        onItemMoved(itemId, minutesToTime(startMin), minutesToTime(clampedEndMin));
      }
    }

    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', onPointerUp);
  });
}
