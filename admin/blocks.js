// admin/blocks.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc,
  query, orderBy, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const blocksCol = collection(db, 'blocks');
let activeAudience = 'invite';

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Every block type's schema. audience: 'invite' | 'public' | 'both' controls which
// sub-tab it's offered in when creating a new block.
const TYPE_DEFS = {
  text: { label: 'Texte', audience: 'both', fields: [
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'content', label: 'Contenu', kind: 'textarea' },
    ] },
  image: { label: 'Image', audience: 'both', fields: [
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'image_url', label: 'URL image', kind: 'url' },
      { key: 'alt', label: 'Alt (accessibilité)', kind: 'text' },
      { key: 'caption', label: 'Légende', kind: 'text' },
    ] },
  teaser: { label: 'Teaser', audience: 'public', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'message', label: 'Message', kind: 'textarea' },
    ] },
  hero: { label: 'Hero', audience: 'invite', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'place', label: 'Lieu', kind: 'text' },
      { key: 'fusion', label: 'Accroche fusion', kind: 'text' },
      { key: 'envInvite', label: 'Enveloppe — invitation', kind: 'text' },
      { key: 'envHint', label: 'Enveloppe — indice', kind: 'text' },
    ] },
  story: { label: 'Histoire', audience: 'invite', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'p1', label: 'Paragraphe 1', kind: 'textarea' },
      { key: 'p2', label: 'Paragraphe 2', kind: 'textarea' },
    ] },
  programme: { label: 'Programme', audience: 'invite', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'subtitle', label: 'Sous-titre', kind: 'textarea' },
    ] },
  infos: { label: 'Infos pratiques', audience: 'invite', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'mapBtnLabel', label: 'Libellé bouton carte', kind: 'text' },
    ], list: { key: 'places', label: 'Lieux', itemFields: [
        { key: 'zh', label: 'Repère (中文)' },
        { key: 'name_fr', label: 'Nom FR' }, { key: 'name_zh', label: 'Nom ZH' },
        { key: 'addr_fr', label: 'Adresse FR' }, { key: 'addr_zh', label: 'Adresse ZH' },
        { key: 'mapUrl', label: 'URL carte' },
      ] } },
  hebergement: { label: 'Hébergement', audience: 'invite', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'intro', label: 'Intro', kind: 'textarea' },
      { key: 'shuttle', label: 'Navette', kind: 'textarea' },
    ], list: { key: 'hotels', label: 'Hôtels', itemFields: [
        { key: 'tag_fr', label: 'Tag FR' }, { key: 'tag_zh', label: 'Tag ZH' },
        { key: 'name_fr', label: 'Nom FR' }, { key: 'name_zh', label: 'Nom ZH' },
        { key: 'desc_fr', label: 'Description FR' }, { key: 'desc_zh', label: 'Description ZH' },
      ] } },
  rsvp: { label: 'RSVP', audience: 'invite', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'intro', label: 'Intro', kind: 'textarea' },
    ] },
  gift: { label: 'Cadeaux', audience: 'invite', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'text', label: 'Texte', kind: 'textarea' },
    ] },
  dress: { label: 'Dress code', audience: 'invite', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'text', label: 'Texte', kind: 'textarea' },
    ], list: { key: 'avoidColors', label: 'Couleurs à éviter', itemFields: [
        { key: 'hex', label: 'Couleur (hex)' },
        { key: 'label_fr', label: 'Libellé FR' }, { key: 'label_zh', label: 'Libellé ZH' },
      ] } },
  gallery: { label: 'Galerie', audience: 'invite', fields: [
      { key: 'kicker', label: 'Kicker', kind: 'text' },
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'hint', label: 'Indice', kind: 'textarea' },
    ] },
  contact: { label: 'Contact', audience: 'invite', fields: [
      { key: 'title', label: 'Titre', kind: 'text' },
      { key: 'text', label: 'Texte', kind: 'textarea' },
    ] },
};

async function loadBlocks() {
  const snap = await getDocs(query(blocksCol, orderBy('order')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function moveBlock(blocks, idx, direction) {
  const other = idx + direction;
  if (other < 0 || other >= blocks.length) return;
  const batch = writeBatch(db);
  batch.update(doc(db, 'blocks', blocks[idx].id), { order: blocks[other].order });
  batch.update(doc(db, 'blocks', blocks[other].id), { order: blocks[idx].order });
  await batch.commit();
  renderBlocksTab();
}

async function toggleVisible(id, value) {
  await updateDoc(doc(db, 'blocks', id), {
    visible: value,
    updatedAt: new Date().toISOString()
  });
}

function renderBlockRow(block, idx, total) {
  const def = TYPE_DEFS[block.type] || { label: block.type };
  const title = (block.type === 'text' || block.type === 'image')
    ? escapeHtml(block.title_fr || '(sans titre)')
    : escapeHtml(def.label);
  return `
    <tr>
      <td>
        <button class="btn-icon btn-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn-icon btn-down" data-idx="${idx}" ${idx === total - 1 ? 'disabled' : ''}>↓</button>
      </td>
      <td><span class="badge">${escapeHtml(def.label)}</span></td>
      <td>${title}</td>
      <td>
        <label class="toggle">
          <input type="checkbox" class="toggle-visible" data-id="${block.id}" ${block.visible ? 'checked' : ''}>
          <span class="toggle-track"></span>
        </label>
      </td>
      <td>
        <div class="table-actions">
          <button class="btn-secondary btn-edit" data-id="${block.id}">Modifier</button>
          <button class="btn-danger btn-delete" data-id="${block.id}">Supprimer</button>
        </div>
      </td>
    </tr>`;
}

export async function renderBlocksTab() {
  const panel = document.getElementById('tab-blocks');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  let allBlocks;
  try {
    allBlocks = await loadBlocks();
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }

  const filtered = allBlocks.filter(b => (b.audience || 'invite') === activeAudience);

  document.getElementById('section-action').innerHTML =
    '<button id="add-block-btn" class="btn-primary">+ Ajouter un bloc</button>';

  const desc = activeAudience === 'invite'
    ? 'Blocs affichés sur le site invité (lien personnel), dans cet ordre.'
    : 'Blocs affichés sur la page publique (sans lien d\'invitation), dans cet ordre.';

  panel.innerHTML = `
    <div class="subtab-nav">
      <button class="subtab-btn ${activeAudience === 'invite' ? 'active' : ''}" data-aud="invite">
        Vue connectée
      </button>
      <button class="subtab-btn ${activeAudience === 'public' ? 'active' : ''}" data-aud="public">
        Vue non connectée
      </button>
    </div>
    <p class="subtab-desc">${escapeHtml(desc)}</p>
    <table class="admin-table">
      <thead>
        <tr>
          <th>Ordre</th><th>Type</th><th>Titre</th><th>Visible</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.length
          ? filtered.map((b, i) => renderBlockRow(b, i, filtered.length)).join('')
          : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:40px">Aucun bloc — ajoutez-en un !</td></tr>'}
      </tbody>
    </table>`;

  panel.querySelectorAll('.subtab-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      activeAudience = btn.dataset.aud;
      renderBlocksTab();
    })
  );

  document.getElementById('add-block-btn').addEventListener('click', () =>
    openBlockPanel(null, allBlocks, activeAudience)
  );
  panel.querySelectorAll('.btn-up').forEach(btn =>
    btn.addEventListener('click', () => moveBlock(filtered, Number(btn.dataset.idx), -1))
  );
  panel.querySelectorAll('.btn-down').forEach(btn =>
    btn.addEventListener('click', () => moveBlock(filtered, Number(btn.dataset.idx), 1))
  );
  panel.querySelectorAll('.toggle-visible').forEach(cb =>
    cb.addEventListener('change', () => toggleVisible(cb.dataset.id, cb.checked))
  );
  panel.querySelectorAll('.btn-edit').forEach(btn =>
    btn.addEventListener('click', () => openBlockPanel(btn.dataset.id, allBlocks, activeAudience))
  );
  panel.querySelectorAll('.btn-delete').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce bloc ?')) return;
      await deleteDoc(doc(db, 'blocks', btn.dataset.id));
      renderBlocksTab();
    })
  );
}

function renderTypeSelector(audience) {
  const options = Object.entries(TYPE_DEFS).filter(([, def]) => def.audience === 'both' || def.audience === audience);
  return `
    <p style="color:var(--muted);font-size:14px;margin-bottom:4px">Choisissez le type de bloc :</p>
    <div class="type-cards">
      ${options.map(([id, def]) => `
        <div class="type-card" data-type="${id}">
          <div class="type-card-label">${escapeHtml(def.label)}</div>
        </div>`).join('')}
    </div>`;
}

function buildScalarFieldHtml(field, data) {
  if (field.kind === 'url') {
    const v = escapeHtml(data?.[field.key] || '');
    return `
      <label class="field">
        <span>${escapeHtml(field.label)}</span>
        <input id="blk-${field.key}" value="${v}" placeholder="https://…">
      </label>`;
  }
  const vFr = escapeHtml(data?.[`${field.key}_fr`] || '');
  const vZh = escapeHtml(data?.[`${field.key}_zh`] || '');
  const tag = field.kind === 'textarea' ? 'textarea' : 'input';
  const attrs = field.kind === 'textarea' ? 'rows="4"' : '';
  const valAttr = (v) => field.kind === 'textarea' ? `>${v}</textarea>` : ` value="${v}">`;
  return `
    <label class="field">
      <span>${escapeHtml(field.label)} FR</span>
      <${tag} id="blk-${field.key}-fr" ${attrs}${valAttr(vFr)}
    </label>
    <label class="field">
      <span>${escapeHtml(field.label)} ZH</span>
      <${tag} id="blk-${field.key}-zh" ${attrs}${valAttr(vZh)}
    </label>`;
}

function buildListItemHtml(listDef, item, idx) {
  const fields = listDef.itemFields.map(f => `
      <label class="field">
        <span>${escapeHtml(f.label)}</span>
        <input class="list-item-field" data-field="${f.key}" value="${escapeHtml(item?.[f.key] || '')}">
      </label>`).join('');
  return `
    <div class="section-list-item" data-idx="${idx}">
      <button type="button" class="btn-icon btn-remove-item">✕</button>
      ${fields}
    </div>`;
}

function buildListHtml(listDef, items) {
  const rows = (items || []).map((item, idx) => buildListItemHtml(listDef, item, idx)).join('');
  return `
    <div class="field">
      <span>${escapeHtml(listDef.label)}</span>
      <div class="section-list" id="blk-list-${listDef.key}">${rows}</div>
      <button type="button" class="btn-secondary section-list-add" id="blk-list-add-${listDef.key}">+ Ajouter un item</button>
    </div>`;
}

function readListFromPanel(panelEl, listDef) {
  const items = [];
  panelEl.querySelectorAll(`#blk-list-${listDef.key} .section-list-item`).forEach(row => {
    const item = {};
    row.querySelectorAll('.list-item-field').forEach(input => {
      item[input.dataset.field] = input.value;
    });
    items.push(item);
  });
  return items;
}

function attachListHandlers(panelEl, def) {
  if (!def.list) return;
  const listEl = panelEl.querySelector(`#blk-list-${def.list.key}`);

  function bindRemoveButtons() {
    listEl.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.onclick = () => { btn.closest('.section-list-item').remove(); };
    });
  }
  bindRemoveButtons();

  panelEl.querySelector(`#blk-list-add-${def.list.key}`).addEventListener('click', () => {
    const idx = listEl.children.length;
    listEl.insertAdjacentHTML('beforeend', buildListItemHtml(def.list, {}, idx));
    bindRemoveButtons();
  });
}

function renderBlockForm(block) {
  const type = block?.type || '';
  if (!type) return '';
  const def = TYPE_DEFS[type];
  const data = block || {};
  const scalarHtml = def.fields.map(f => buildScalarFieldHtml(f, data)).join('');
  const listHtml = def.list ? buildListHtml(def.list, data[def.list.key]) : '';
  const imagePreview = type === 'image' ? '<div id="img-existing-preview"></div>' : '';

  return `
    <input type="hidden" id="block-type" value="${type}">
    <div class="field" style="flex-direction:row;align-items:center;gap:10px;margin-bottom:14px">
      <span>Visible sur le site</span>
      <label class="toggle">
        <input type="checkbox" id="block-visible" ${data.visible !== false ? 'checked' : ''}>
        <span class="toggle-track"></span>
      </label>
    </div>
    ${scalarHtml}
    ${imagePreview}
    ${listHtml}`;
}

function attachImagePreview(panelEl, imageUrl) {
  if (!imageUrl) return;
  const container = panelEl.querySelector('#img-existing-preview');
  if (!container) return;
  const img = document.createElement('img');
  img.className = 'image-preview';
  img.src = imageUrl;
  container.appendChild(img);
}

function openBlockPanel(id, allBlocks, audience) {
  const block = id ? allBlocks.find(b => b.id === id) : null;
  const isNew = !block;
  const filtered = allBlocks.filter(b => (b.audience || 'invite') === audience);

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${isNew ? 'Nouveau bloc' : 'Modifier le bloc'}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body" id="panel-body">
      ${isNew ? renderTypeSelector(audience) : renderBlockForm(block)}
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save" ${isNew ? 'disabled' : ''}>${isNew ? 'Créer' : 'Enregistrer'}</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); renderBlocksTab(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  if (isNew) {
    panelEl.querySelectorAll('.type-card').forEach(card => {
      card.addEventListener('click', () => {
        panelEl.querySelectorAll('.type-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        panelEl.querySelector('#panel-body').innerHTML =
          renderBlockForm({ type: card.dataset.type, visible: true });
        panelEl.querySelector('#panel-save').disabled = false;
        attachListHandlers(panelEl, TYPE_DEFS[card.dataset.type]);
      });
    });
  } else {
    attachImagePreview(panelEl, block?.image_url);
    attachListHandlers(panelEl, TYPE_DEFS[block.type]);
  }

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const saveBtn = panelEl.querySelector('#panel-save');
    saveBtn.disabled = true;
    saveBtn.textContent = isNew ? 'Création…' : 'Enregistrement…';
    try {
      await saveBlock(id, filtered, panelEl, audience);
      close();
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = isNew ? 'Créer' : 'Enregistrer';
      console.error(err);
    }
  });
}

async function saveBlock(id, filteredBlocks, panelEl, audience) {
  const type = panelEl.querySelector('#block-type')?.value;
  if (!type) throw new Error('no-type');
  const def = TYPE_DEFS[type];
  const now = new Date().toISOString();

  const data = {
    type,
    visible: panelEl.querySelector('#block-visible')?.checked ?? true,
    audience,
    updatedAt: now,
  };

  def.fields.forEach(f => {
    if (f.kind === 'url') {
      data[f.key] = panelEl.querySelector(`#blk-${f.key}`)?.value || '';
    } else {
      data[`${f.key}_fr`] = panelEl.querySelector(`#blk-${f.key}-fr`)?.value || '';
      data[`${f.key}_zh`] = panelEl.querySelector(`#blk-${f.key}-zh`)?.value || '';
    }
  });
  if (def.list) {
    data[def.list.key] = readListFromPanel(panelEl, def.list);
  }

  if (id) {
    await updateDoc(doc(db, 'blocks', id), data);
  } else {
    const maxOrder = filteredBlocks.length ? Math.max(...filteredBlocks.map(b => b.order ?? 0)) : 0;
    await addDoc(blocksCol, { ...data, order: maxOrder + 1, createdAt: now });
  }
}
