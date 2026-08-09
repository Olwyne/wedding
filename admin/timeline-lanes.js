// admin/timeline-lanes.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, writeBatch,
  query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const lanesCol = collection(db, 'timelineLanes');
const runOfShowCol = collection(db, 'runOfShow');

export const GENERAL_LANE_ID = '__general__';
const GENERAL_LANE = { id: GENERAL_LANE_ID, label: 'Général', order: -1, color: '#9ca3af' };

export async function loadLanes() {
  const snap = await getDocs(query(lanesCol, orderBy('order')));
  return [GENERAL_LANE, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))];
}

export async function addLane(label, color) {
  const snap = await getDocs(lanesCol);
  const maxOrder = snap.docs.reduce((max, d) => Math.max(max, d.data().order ?? 0), 0);
  await addDoc(lanesCol, { label, color, order: maxOrder + 1 });
}

export async function renameLane(id, label, color) {
  await updateDoc(doc(db, 'timelineLanes', id), { label, color });
}

export async function reorderLane(lanes, id, direction) {
  const movable = lanes.filter(l => l.id !== GENERAL_LANE_ID);
  const idx = movable.findIndex(l => l.id === id);
  const targetIdx = idx + direction;
  if (idx === -1 || targetIdx < 0 || targetIdx >= movable.length) return;
  const a = movable[idx];
  const b = movable[targetIdx];
  await updateDoc(doc(db, 'timelineLanes', a.id), { order: b.order });
  await updateDoc(doc(db, 'timelineLanes', b.id), { order: a.order });
}

export async function deleteLane(id) {
  const itemsSnap = await getDocs(runOfShowCol);
  const batch = writeBatch(db);
  itemsSnap.docs.forEach(d => {
    if (d.data().laneId === id) batch.update(d.ref, { laneId: null });
  });
  batch.delete(doc(db, 'timelineLanes', id));
  await batch.commit();
}
