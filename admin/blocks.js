// admin/blocks.js
import { db, storage } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc,
  query, orderBy, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  ref, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

const blocksCol = collection(db, 'blocks');

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

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
  const typeLabel = block.type === 'text' ? 'TEXTE' : 'IMAGE';
  const typeClass = block.type === 'text' ? 'badge-text' : 'badge-image';
  const title = escapeHtml(block.title_fr || '(sans titre)');
  return `
    <tr>
      <td>
        <button class="btn-icon btn-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn-icon btn-down" data-idx="${idx}" ${idx === total - 1 ? 'disabled' : ''}>↓</button>
      </td>
      <td><span class="badge ${typeClass}">${typeLabel}</span></td>
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

  document.getElementById('section-action').innerHTML =
    '<button id="add-block-btn" class="btn-primary">+ Ajouter un bloc</button>';

  const blocks = await loadBlocks();

  panel.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Ordre</th><th>Type</th><th>Titre</th><th>Visible</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${blocks.length
          ? blocks.map((b, i) => renderBlockRow(b, i, blocks.length)).join('')
          : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:40px">Aucun bloc — ajoutez-en un !</td></tr>'}
      </tbody>
    </table>`;

  document.getElementById('add-block-btn').addEventListener('click', () =>
    openBlockPanel(null, blocks)
  );
  panel.querySelectorAll('.btn-up').forEach(btn =>
    btn.addEventListener('click', () => moveBlock(blocks, Number(btn.dataset.idx), -1))
  );
  panel.querySelectorAll('.btn-down').forEach(btn =>
    btn.addEventListener('click', () => moveBlock(blocks, Number(btn.dataset.idx), 1))
  );
  panel.querySelectorAll('.toggle-visible').forEach(cb =>
    cb.addEventListener('change', () => toggleVisible(cb.dataset.id, cb.checked))
  );
  panel.querySelectorAll('.btn-edit').forEach(btn =>
    btn.addEventListener('click', () => openBlockPanel(btn.dataset.id, blocks))
  );
  panel.querySelectorAll('.btn-delete').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce bloc ?')) return;
      await deleteDoc(doc(db, 'blocks', btn.dataset.id));
      renderBlocksTab();
    })
  );
}

function renderTypeSelector() {
  return `
    <p style="color:var(--muted);font-size:14px;margin-bottom:4px">Choisissez le type de bloc :</p>
    <div class="type-cards">
      <div class="type-card" data-type="text">
        <div class="type-card-icon">📝</div>
        <div class="type-card-label">Texte</div>
      </div>
      <div class="type-card" data-type="image">
        <div class="type-card-icon">🖼️</div>
        <div class="type-card-label">Image</div>
      </div>
    </div>`;
}

function renderBlockForm(block) {
  const type = block?.type || '';
  if (!type) return renderTypeSelector();

  const v = (key) => escapeHtml(block?.[key] || '');
  const checked = (key) => block?.[key] !== false ? 'checked' : '';

  const common = `
    <input type="hidden" id="block-type" value="${type}">
    <label class="field">
      <span>Titre FR <span style="color:var(--muted);font-weight:400">(optionnel)</span></span>
      <input id="block-title-fr" value="${v('title_fr')}">
    </label>
    <label class="field">
      <span>Titre ZH</span>
      <input id="block-title-zh" value="${v('title_zh')}">
    </label>
    <div class="field" style="flex-direction:row;align-items:center;gap:10px">
      <span>Visible sur le site</span>
      <label class="toggle">
        <input type="checkbox" id="block-visible" ${checked('visible')}>
        <span class="toggle-track"></span>
      </label>
    </div>`;

  if (type === 'text') {
    return `
      ${common}
      <label class="field">
        <span>Contenu FR</span>
        <textarea id="block-content-fr" rows="6">${v('content_fr')}</textarea>
      </label>
      <label class="field">
        <span>Contenu ZH</span>
        <textarea id="block-content-zh" rows="6">${v('content_zh')}</textarea>
      </label>`;
  }

  if (type === 'image') {
    const hasUrl = !!block?.image_url;
    return `
      ${common}
      <fieldset style="border:none;padding:0;display:flex;flex-direction:column;gap:10px">
        <legend style="font-size:14px;font-weight:600;margin-bottom:4px">Source image</legend>
        <div style="display:flex;gap:20px">
          <label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer">
            <input type="radio" name="img-source" value="url" ${hasUrl ? 'checked' : ''}> URL externe
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer">
            <input type="radio" name="img-source" value="upload" ${!hasUrl ? 'checked' : ''}> Upload
          </label>
        </div>
        <div id="img-url-field" ${hasUrl ? '' : 'hidden'} class="field">
          <input id="block-image-url" value="${v('image_url')}" placeholder="https://…">
        </div>
        <div id="img-upload-field" ${hasUrl ? 'hidden' : ''} class="field">
          <input type="file" id="block-image-file" accept="image/*">
          ${hasUrl ? `<img src="${v('image_url')}" class="image-preview">` : ''}
        </div>
      </fieldset>
      <label class="field">
        <span>Alt FR <span style="color:var(--muted);font-weight:400">(accessibilité)</span></span>
        <input id="block-alt-fr" value="${v('alt_fr')}">
      </label>
      <label class="field">
        <span>Alt ZH</span>
        <input id="block-alt-zh" value="${v('alt_zh')}">
      </label>
      <label class="field">
        <span>Légende FR <span style="color:var(--muted);font-weight:400">(optionnel)</span></span>
        <input id="block-caption-fr" value="${v('caption_fr')}">
      </label>
      <label class="field">
        <span>Légende ZH</span>
        <input id="block-caption-zh" value="${v('caption_zh')}">
      </label>`;
  }

  return '';
}

function attachImageToggle(panelEl) {
  panelEl.querySelectorAll('input[name="img-source"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isUrl = panelEl.querySelector('input[name="img-source"]:checked').value === 'url';
      panelEl.querySelector('#img-url-field').hidden = !isUrl;
      panelEl.querySelector('#img-upload-field').hidden = isUrl;
    });
  });
  const fileInput = panelEl.querySelector('#block-image-file');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const existing = panelEl.querySelector('.image-preview');
      if (existing) existing.remove();
      const img = document.createElement('img');
      img.className = 'image-preview';
      img.src = URL.createObjectURL(file);
      fileInput.parentElement.appendChild(img);
    });
  }
}

function openBlockPanel(id, blocks) {
  const block = id ? blocks.find(b => b.id === id) : null;
  const isNew = !block;

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
      ${isNew ? renderTypeSelector() : renderBlockForm(block)}
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">${isNew ? 'Créer' : 'Enregistrer'}</button>
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
        attachImageToggle(panelEl);
      });
    });
  } else {
    attachImageToggle(panelEl);
  }

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const saveBtn = panelEl.querySelector('#panel-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Enregistrement…';
    try {
      await saveBlock(id, blocks, panelEl);
      close();
    } catch (err) {
      console.error(err);
      saveBtn.disabled = false;
      saveBtn.textContent = isNew ? 'Créer' : 'Enregistrer';
    }
  });
}

async function saveBlock(id, blocks, panelEl) {
  const type = panelEl.querySelector('#block-type')?.value;
  if (!type) return;

  const now = new Date().toISOString();
  const get = (sel) => panelEl.querySelector(sel)?.value || '';

  const data = {
    type,
    title_fr: get('#block-title-fr'),
    title_zh: get('#block-title-zh'),
    visible: panelEl.querySelector('#block-visible')?.checked ?? true,
    updatedAt: now,
  };

  if (type === 'text') {
    data.content_fr = get('#block-content-fr');
    data.content_zh = get('#block-content-zh');
  }

  if (type === 'image') {
    const imgSource = panelEl.querySelector('input[name="img-source"]:checked')?.value;
    if (imgSource === 'url') {
      data.image_url = get('#block-image-url');
    } else {
      const file = panelEl.querySelector('#block-image-file')?.files[0];
      if (file) {
        const storageRef = ref(storage, `blocks/${Date.now()}-${file.name}`);
        const snap = await uploadBytes(storageRef, file);
        data.image_url = await getDownloadURL(snap.ref);
      } else if (id) {
        data.image_url = blocks.find(b => b.id === id)?.image_url || '';
      } else {
        data.image_url = '';
      }
    }
    data.alt_fr = get('#block-alt-fr');
    data.alt_zh = get('#block-alt-zh');
    data.caption_fr = get('#block-caption-fr');
    data.caption_zh = get('#block-caption-zh');
  }

  if (id) {
    await updateDoc(doc(db, 'blocks', id), data);
  } else {
    const maxOrder = blocks.length ? Math.max(...blocks.map(b => b.order ?? 0)) : 0;
    await addDoc(blocksCol, { ...data, order: maxOrder + 1, createdAt: now });
  }
}
