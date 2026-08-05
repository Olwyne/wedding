import { db } from '../firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let currentPermissions = {};

export async function loadPermissions(uid) {
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    currentPermissions = snap.exists() ? (snap.data().permissions || {}) : {};
  } catch (err) {
    console.error('loadPermissions failed', err);
    currentPermissions = {};
  }
  return currentPermissions;
}

export function getPermission(sectionId) {
  return currentPermissions[sectionId] || 'none';
}

export function canRead(sectionId) {
  const level = getPermission(sectionId);
  return level === 'read' || level === 'write';
}

export function canWrite(sectionId) {
  return getPermission(sectionId) === 'write';
}
