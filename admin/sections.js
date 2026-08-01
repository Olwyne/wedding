// admin/sections.js
import { db } from '../firebase-init.js';
import {
  doc, getDoc, getDocs, collection, setDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const SECTION_TYPES = [
  { id: 'teaser', label: 'Vue non connectée (Teaser)', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'message', label: 'Message', kind: 'textarea' },
    ] },
  { id: 'hero', label: 'Hero', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'place', label: 'Lieu', kind: 'text' },
      { key: 'fusion', label: 'Accroche fusion', kind: 'text' },
      { key: 'envInvite', label: 'Enveloppe — invitation', kind: 'text' },
      { key: 'envHint', label: 'Enveloppe — indice', kind: 'text' },
    ] },
  { id: 'story', label: 'Histoire', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'p1', label: 'Paragraphe 1', kind: 'textarea' },
      { key: 'p2', label: 'Paragraphe 2', kind: 'textarea' },
    ] },
  { id: 'programme', label: 'Programme', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'subtitle', label: 'Sous-titre', kind: 'textarea' },
    ] },
  { id: 'infos', label: 'Infos pratiques', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'mapBtnLabel', label: 'Libellé bouton carte', kind: 'text' },
    ], list: { key: 'places', label: 'Lieux', itemFields: [
        { key: 'zh', label: 'Repère (中文)' },
        { key: 'name_fr', label: 'Nom FR' }, { key: 'name_zh', label: 'Nom ZH' },
        { key: 'addr_fr', label: 'Adresse FR' }, { key: 'addr_zh', label: 'Adresse ZH' },
        { key: 'mapUrl', label: 'URL carte' },
      ] } },
  { id: 'hebergement', label: 'Hébergement', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'intro', label: 'Intro', kind: 'textarea' },
      { key: 'shuttle', label: 'Navette', kind: 'textarea' },
    ], list: { key: 'hotels', label: 'Hôtels', itemFields: [
        { key: 'tag_fr', label: 'Tag FR' }, { key: 'tag_zh', label: 'Tag ZH' },
        { key: 'name_fr', label: 'Nom FR' }, { key: 'name_zh', label: 'Nom ZH' },
        { key: 'desc_fr', label: 'Description FR' }, { key: 'desc_zh', label: 'Description ZH' },
      ] } },
  { id: 'rsvp', label: 'RSVP', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'intro', label: 'Intro', kind: 'textarea' },
    ] },
  { id: 'gift', label: 'Cadeaux', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'text', label: 'Texte', kind: 'textarea' },
    ] },
  { id: 'dress', label: 'Dress code', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'text', label: 'Texte', kind: 'textarea' },
    ], list: { key: 'avoidColors', label: 'Couleurs à éviter', itemFields: [
        { key: 'hex', label: 'Couleur (hex)' },
        { key: 'label_fr', label: 'Libellé FR' }, { key: 'label_zh', label: 'Libellé ZH' },
      ] } },
  { id: 'gallery', label: 'Galerie', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'hint', label: 'Indice', kind: 'textarea' },
    ] },
  { id: 'contact', label: 'Contact', fields: [
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'text', label: 'Texte', kind: 'textarea' },
    ] },
];

async function loadSections() {
  const snap = await getDocs(collection(db, 'sections'));
  const map = {};
  snap.docs.forEach(d => { map[d.id] = d.data(); });
  return map;
}

async function toggleVisible(type, current, value) {
  await setDoc(doc(db, 'sections', type), { ...current, visible: value, updatedAt: new Date().toISOString() }, { merge: true });
}

function renderSectionRow(def, data) {
  const visible = data?.visible !== false;
  return `
    <tr>
      <td>${escapeHtml(def.label)}</td>
      <td>
        <label class="toggle">
          <input type="checkbox" class="toggle-visible" data-type="${def.id}" ${visible ? 'checked' : ''}>
          <span class="toggle-track"></span>
        </label>
      </td>
      <td>
        <div class="table-actions">
          <button class="btn-secondary btn-edit" data-type="${def.id}">Modifier</button>
        </div>
      </td>
    </tr>`;
}

export async function renderSectionsTab() {
  const panel = document.getElementById('tab-sections');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  let sectionsMap;
  try {
    sectionsMap = await loadSections();
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }

  document.getElementById('section-action').innerHTML = '';

  panel.innerHTML = `
    <p class="subtab-desc">Contenu structuré des 11 sections fixes du site (accueil public + site invité).</p>
    <table class="admin-table">
      <thead>
        <tr><th>Section</th><th>Visible</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${SECTION_TYPES.map(def => renderSectionRow(def, sectionsMap[def.id])).join('')}
      </tbody>
    </table>`;

  panel.querySelectorAll('.toggle-visible').forEach(cb =>
    cb.addEventListener('change', async () => {
      const type = cb.dataset.type;
      try {
        await toggleVisible(type, sectionsMap[type] || {}, cb.checked);
      } catch (err) {
        console.error(err);
        cb.checked = !cb.checked;
      }
    })
  );

  panel.querySelectorAll('.btn-edit').forEach(btn =>
    btn.addEventListener('click', () => openSectionPanel(btn.dataset.type, sectionsMap))
  );
}

function openSectionPanel(type, sectionsMap) {
  // implemented in Task 6
}
