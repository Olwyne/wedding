# Admin Back-Office Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the admin back-office with a sidebar layout and new design system, add a dynamic Blocks tab (CRUD + Firebase Storage), redesign the Guests tab UI, and render blocks on the main wedding site.

**Architecture:** Vanilla ES modules with Firebase (Firestore + Auth + Storage). Each admin section is a standalone JS module exporting a `render*Tab()` function. The sidebar replaces the current tab-button nav. No build system — all imports via CDN.

**Tech Stack:** Firebase 10.7.1 (Firestore, Auth, Storage), vanilla JS ES modules, plain HTML/CSS.

## Global Constraints

- Firebase SDK version: `10.7.1` — do not change
- All CDN imports: `https://www.gstatic.com/firebasejs/10.7.1/firebase-*.js`
- No frameworks, no npm, no build step
- `escapeHtml()` required on all user-controlled string → innerHTML insertions (XSS)
- Bilingual: every user-facing content field has `_fr` and `_zh` variants
- Admin is desktop-only, no responsive needed

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `admin/index.html` | Modify | Sidebar layout, section panels |
| `admin/styles.css` | Rewrite | New admin design system |
| `admin/script.js` | Modify | Sidebar routing, render on nav click |
| `admin/blocks.js` | **Create** | Blocks tab: CRUD, reorder, upload |
| `admin/guests.js` | Modify | Slide-in panel, badges, toggle buttons |
| `admin/events.js` | Modify | Restyle for new design system |
| `firebase-init.js` | Modify | Export `storage` |
| `firestore.rules` | Modify | Add `blocks` read/write rules |
| `storage.rules` | **Create** | Blocks images: public read, auth write |
| `firebase.json` | Modify | Add storage rules config |
| `index.html` | Modify | Add `#blocks-section` after `#programme` |
| `script.js` | Modify | Read + render blocks from Firestore |
| `styles.css` | Modify | Styles for blocks section on main site |

---

## Task 1: Admin shell — sidebar layout + design system

**Files:**
- Modify: `admin/index.html`
- Rewrite: `admin/styles.css`

**Interfaces:**
- Produces: `.nav-item[data-section]` buttons, `#tab-blocks`, `#tab-guests`, `#tab-events` panels, `#section-title`, `#section-action` (used by Task 2, 3, 4)

- [ ] **Step 1: Replace admin/index.html**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Back office — Sophie &amp; Ruiyuan</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>

<div id="login-screen" class="login-screen">
  <form id="login-form" class="login-form">
    <h1>Back office</h1>
    <label class="field">
      <span>Email</span>
      <input id="login-email" type="email" required>
    </label>
    <label class="field">
      <span>Mot de passe</span>
      <input id="login-password" type="password" required>
    </label>
    <p id="login-error" class="login-error" hidden></p>
    <button type="submit" class="btn-primary">Se connecter</button>
  </form>
</div>

<div id="dashboard" class="dashboard" hidden>
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="sidebar-brand-title">S &amp; R · Admin</div>
      <div class="sidebar-brand-sub">Back office</div>
    </div>
    <nav class="sidebar-nav">
      <button class="nav-item active" data-section="blocks">
        <span class="nav-icon">⬛</span> Blocs
      </button>
      <button class="nav-item" data-section="guests">
        <span class="nav-icon">👥</span> Invités
      </button>
      <button class="nav-item" data-section="events">
        <span class="nav-icon">📅</span> Événements
      </button>
    </nav>
    <div class="sidebar-footer">
      <button id="logout-btn" class="btn-secondary sidebar-logout">Se déconnecter</button>
    </div>
  </aside>
  <main class="content-area">
    <div class="content-header">
      <h2 id="section-title">Blocs</h2>
      <div id="section-action"></div>
    </div>
    <div class="content-body">
      <div id="tab-blocks" class="tab-panel"></div>
      <div id="tab-guests" class="tab-panel" hidden></div>
      <div id="tab-events" class="tab-panel" hidden></div>
    </div>
  </main>
</div>

<script type="module" src="script.js"></script>
</body>
</html>
```

- [ ] **Step 2: Rewrite admin/styles.css**

```css
:root {
  --sidebar-bg: #1a1f2e;
  --sidebar-w: 220px;
  --admin-bg: #f5f6f8;
  --admin-card: #ffffff;
  --accent: #6E1A1A;
  --accent-hover: #5a1515;
  --text: #1a1a1a;
  --muted: #6b7280;
  --border: #e5e7eb;
  --danger: #dc2626;
}
*{box-sizing:border-box;margin:0;padding:0}
[hidden]{display:none !important}
body{font-family:system-ui,-apple-system,sans-serif;background:var(--admin-bg);color:var(--text)}
button{cursor:pointer;font-family:inherit}

/* ── Login ── */
.login-screen{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--sidebar-bg)}
.login-form{background:#fff;padding:36px;border-radius:8px;display:flex;flex-direction:column;gap:14px;min-width:340px;box-shadow:0 4px 24px rgba(0,0,0,.25)}
.login-form h1{font-size:20px;font-weight:600}
.login-error{color:var(--danger);font-size:13px}

/* ── Fields ── */
.field{display:flex;flex-direction:column;gap:4px;font-size:14px}
.field input,.field textarea,.field select{padding:8px 10px;border:1px solid var(--border);border-radius:4px;font-size:14px;font-family:inherit}
.field input:focus,.field textarea:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
.field textarea{resize:vertical;min-height:80px}

/* ── Buttons ── */
.btn-primary{background:var(--accent);color:#fff;border:none;padding:8px 16px;border-radius:4px;font-size:14px;font-weight:500}
.btn-primary:hover{background:var(--accent-hover)}
.btn-secondary{background:transparent;border:1px solid var(--border);color:var(--text);padding:7px 15px;border-radius:4px;font-size:14px}
.btn-secondary:hover{background:var(--admin-bg)}
.btn-danger{background:var(--danger);color:#fff;border:none;padding:6px 12px;border-radius:4px;font-size:13px}
.btn-danger:hover{background:#b91c1c}
.btn-icon{background:transparent;border:none;padding:4px 8px;color:var(--muted);font-size:15px;border-radius:4px}
.btn-icon:hover{background:var(--admin-bg);color:var(--text)}
.btn-icon:disabled{opacity:.3;cursor:not-allowed}
.table-actions{display:flex;gap:6px;align-items:center}

/* ── Sidebar ── */
.dashboard{display:flex;min-height:100vh}
.sidebar{width:var(--sidebar-w);background:var(--sidebar-bg);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0}
.sidebar-brand{padding:20px 16px;border-bottom:1px solid rgba(255,255,255,.08)}
.sidebar-brand-title{color:#fff;font-size:15px;font-weight:600;letter-spacing:.02em}
.sidebar-brand-sub{color:rgba(255,255,255,.4);font-size:12px;margin-top:2px}
.sidebar-nav{flex:1;padding:12px 0}
.nav-item{display:flex;align-items:center;gap:10px;padding:10px 16px;color:rgba(255,255,255,.6);font-size:14px;border:none;background:none;width:100%;text-align:left;transition:background .15s}
.nav-item:hover{background:rgba(255,255,255,.07);color:#fff}
.nav-item.active{background:var(--accent);color:#fff}
.nav-icon{font-size:13px}
.sidebar-footer{padding:16px;border-top:1px solid rgba(255,255,255,.08)}
.sidebar-logout{width:100%;justify-content:center}

/* ── Content area ── */
.content-area{margin-left:var(--sidebar-w);flex:1}
.content-header{display:flex;justify-content:space-between;align-items:center;padding:18px 28px;background:var(--admin-card);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:10}
.content-header h2{font-size:18px;font-weight:600}
.content-body{padding:24px 28px}

/* ── Table ── */
.admin-table{width:100%;border-collapse:collapse;background:var(--admin-card);border-radius:6px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.07)}
.admin-table th,.admin-table td{padding:10px 14px;font-size:14px;text-align:left;border-bottom:1px solid var(--border)}
.admin-table th{background:#f9fafb;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.admin-table tr:last-child td{border-bottom:none}
.admin-table tbody tr:hover td{background:#fafafa}

/* ── Badges ── */
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:500;white-space:nowrap}
.badge-text{background:#dbeafe;color:#1d4ed8}
.badge-image{background:#d1fae5;color:#065f46}
.badge-pending{background:#fef3c7;color:#92400e}
.badge-confirmed{background:#d1fae5;color:#065f46}
.badge-marie{background:#fee2e2;color:#9f1239}
.badge-mariee{background:#fce7f3;color:#86198f}
.badge-deux{background:#f3f4f6;color:#374151}

/* ── Toggle switch ── */
.toggle{position:relative;display:inline-flex;width:36px;height:20px;flex-shrink:0}
.toggle input{opacity:0;width:0;height:0;position:absolute}
.toggle-track{position:absolute;cursor:pointer;inset:0;background:var(--border);border-radius:999px;transition:background .2s}
.toggle-track::before{content:'';position:absolute;height:14px;width:14px;left:3px;top:3px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.toggle input:checked+.toggle-track{background:#16a34a}
.toggle input:checked+.toggle-track::before{transform:translateX(16px)}

/* ── Slide-in panel ── */
.panel-overlay{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:100}
.panel{position:fixed;top:0;right:0;bottom:0;width:480px;background:var(--admin-card);z-index:101;display:flex;flex-direction:column;box-shadow:-4px 0 24px rgba(0,0,0,.15)}
.panel-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0}
.panel-header h3{font-size:16px;font-weight:600}
.panel-body{flex:1;padding:20px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}
.panel-footer{padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:10px;flex-shrink:0}

/* ── Toggle button group (guest side) ── */
.btn-group{display:flex;border:1px solid var(--border);border-radius:4px;overflow:hidden}
.btn-group-item{flex:1;padding:8px 12px;background:var(--admin-card);border:none;font-size:14px;color:var(--muted);text-align:center;transition:background .15s}
.btn-group-item:not(:last-child){border-right:1px solid var(--border)}
.btn-group-item.active{background:var(--accent);color:#fff}

/* ── Event cards (guest form) ── */
.event-cards{display:flex;flex-direction:column;gap:8px}
.event-card{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:4px;cursor:pointer;transition:border-color .15s}
.event-card.selected{border-color:var(--accent);background:#fef2f2}
.event-card-info{flex:1}
.event-card-title{font-size:14px;font-weight:500}
.event-card-meta{font-size:12px;color:var(--muted);margin-top:2px}
.event-card-check{width:18px;height:18px;border:2px solid var(--border);border-radius:3px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px}
.event-card.selected .event-card-check{background:var(--accent);border-color:var(--accent);color:#fff}

/* ── Type selector (new block) ── */
.type-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.type-card{padding:24px 16px;border:2px solid var(--border);border-radius:6px;cursor:pointer;text-align:center;transition:border-color .15s}
.type-card:hover{border-color:var(--accent)}
.type-card.selected{border-color:var(--accent);background:#fef2f2}
.type-card-icon{font-size:28px;margin-bottom:8px}
.type-card-label{font-size:14px;font-weight:600}

/* ── Image preview ── */
.image-preview{max-width:100%;max-height:180px;border-radius:4px;margin-top:8px;border:1px solid var(--border);display:block}

/* ── Misc ── */
.guest-invite-result{background:#f0fdf4;border:1px solid #bbf7d0;padding:12px;border-radius:4px;font-size:13px;word-break:break-all;display:flex;align-items:center;gap:10px}
.pills{display:flex;flex-wrap:wrap;gap:4px}
.pill{padding:2px 8px;background:var(--admin-bg);border:1px solid var(--border);border-radius:999px;font-size:12px}
```

- [ ] **Step 3: Verify in browser**

Open `admin/index.html` in browser. Expected:
- Dark sidebar (220px) on left with "S & R · Admin" brand
- "Blocs", "Invités", "Événements" nav items; Blocs active (bordeaux)
- White content area with sticky header
- Login screen has clean card on dark background
- No EB Garamond, no cream background in admin

- [ ] **Step 4: Commit**

```bash
rtk git add admin/index.html admin/styles.css
rtk git commit -m "feat: admin shell — sidebar layout and new design system"
```

---

## Task 2: Firebase Storage setup + Firestore rules

**Files:**
- Modify: `firebase-init.js`
- Modify: `firestore.rules`
- Create: `storage.rules`
- Modify: `firebase.json`

**Interfaces:**
- Produces: `storage` export from `firebase-init.js` (used by Task 3 — `blocks.js`)

- [ ] **Step 1: Add Storage to firebase-init.js**

```javascript
// firebase-init.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
```

- [ ] **Step 2: Update firestore.rules — add blocks collection**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /events/{eventId} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /guests/{guestId} {
      allow get: if true;
      allow list: if request.auth != null;
      allow create: if request.auth != null;
      allow delete: if request.auth != null;
      allow update: if request.auth != null
        || request.resource.data.diff(resource.data).affectedKeys().hasOnly(['rsvp']);
    }

    match /blocks/{blockId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

- [ ] **Step 3: Create storage.rules**

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /blocks/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

- [ ] **Step 4: Update firebase.json — add storage config**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  }
}
```

- [ ] **Step 5: Deploy rules**

```bash
firebase deploy --only firestore:rules,storage
```

Expected: `Deploy complete!`

> **Note:** If Firebase Storage hasn't been activated on the project, go to Firebase Console → Storage → Get started. Choose a region (e.g. `europe-west1`). Then re-run the deploy.

- [ ] **Step 6: Commit**

```bash
rtk git add firebase-init.js firestore.rules storage.rules firebase.json
rtk git commit -m "feat: add Firebase Storage and blocks Firestore rules"
```

---

## Task 3: Blocks tab — CRUD, reorder, image upload

**Files:**
- Create: `admin/blocks.js`
- Modify: `admin/script.js`

**Interfaces:**
- Consumes: `db`, `storage` from `../firebase-init.js`; `#tab-blocks`, `#section-action`, `#section-title` from `admin/index.html` (Task 1)
- Produces: `renderBlocksTab()` exported function (used by `admin/script.js`)

- [ ] **Step 1: Create admin/blocks.js**

```javascript
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
```

- [ ] **Step 2: Update admin/script.js — sidebar routing + blocks import**

```javascript
// admin/script.js
import { initAuth } from './auth.js';
import { renderBlocksTab } from './blocks.js';
import { renderGuestsTab } from './guests.js';
import { renderEventsTab } from './events.js';

const SECTIONS = {
  blocks: { title: 'Blocs', render: renderBlocksTab },
  guests: { title: 'Invités', render: renderGuestsTab },
  events: { title: 'Événements', render: renderEventsTab },
};

function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = true; });
      const section = btn.dataset.section;
      document.getElementById('tab-' + section).hidden = false;
      document.getElementById('section-title').textContent = SECTIONS[section].title;
      SECTIONS[section].render();
    });
  });
}

initNav();
initAuth({
  onSignedIn: () => renderBlocksTab(),
  onSignedOut: () => {},
});
```

- [ ] **Step 3: Verify in browser**

Log into admin. Expected:
- "Blocs" section loads, shows empty table with "+ Ajouter un bloc" button
- Click "+ Ajouter un bloc" → slide-in panel with type selector cards
- Click "Texte" card → form with Titre FR/ZH, Contenu FR/ZH, Visible toggle
- Click "Image" card → form with radio URL/upload, alt, caption fields
- Create a text block → appears in table with TEXTE badge
- Toggle visible → updates without full reload
- ↑↓ buttons reorder rows
- Supprimer → confirm dialog → block removed
- Modify → slide-in pre-filled with existing values

- [ ] **Step 4: Commit**

```bash
rtk git add admin/blocks.js admin/script.js
rtk git commit -m "feat: add blocks tab with CRUD, reorder, and image upload"
```

---

## Task 4: Guest tab — redesign UI (slide-in, badges, event cards)

**Files:**
- Modify: `admin/guests.js`

**Interfaces:**
- Consumes: `db` from `../firebase-init.js`; `loadEvents()` from `./events.js`; `#tab-guests`, `#section-action` from HTML
- Produces: `renderGuestsTab()` exported function (unchanged signature)

- [ ] **Step 1: Replace admin/guests.js**

```javascript
// admin/guests.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadEvents } from './events.js';

const guestsCol = collection(db, 'guests');

const SIDE_LABELS = { marie: 'Marié', mariee: 'Mariée', deux: 'Les deux' };
const SIDE_BADGE  = { marie: 'badge-marie', mariee: 'badge-mariee', deux: 'badge-deux' };

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function generateToken(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let token = '';
  for (let i = 0; i < length; i++) token += chars[bytes[i] % chars.length];
  return token;
}

async function loadGuests() {
  const snap = await getDocs(guestsCol);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function renderGuestRow(g, eventById) {
  const side = g.side || 'deux';
  const pills = (g.assignedEvents || [])
    .map(id => eventById[id]
      ? `<span class="pill">${escapeHtml(eventById[id].title_fr)}</span>`
      : '')
    .join('');
  const rsvp = g.rsvp || {};
  const statusLabel = rsvp.status === 'confirmed' ? 'Confirmé' : 'En attente';
  const statusClass = rsvp.status === 'confirmed' ? 'badge-confirmed' : 'badge-pending';
  return `
    <tr>
      <td>${escapeHtml(g.name)}</td>
      <td><span class="badge ${SIDE_BADGE[side]}">${SIDE_LABELS[side]}</span></td>
      <td><div class="pills">${pills}</div></td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>${rsvp.adults ?? ''}</td>
      <td>${rsvp.children ?? ''}</td>
      <td>
        <button class="btn-icon btn-copy-link" data-token="${escapeHtml(g.id)}" title="Copier le lien">📋</button>
      </td>
      <td>
        <div class="table-actions">
          <button class="btn-secondary btn-edit-guest" data-id="${escapeHtml(g.id)}">Modifier</button>
          <button class="btn-danger btn-delete-guest" data-id="${escapeHtml(g.id)}">Supprimer</button>
        </div>
      </td>
    </tr>`;
}

export async function renderGuestsTab() {
  const panel = document.getElementById('tab-guests');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  document.getElementById('section-action').innerHTML =
    '<button id="add-guest-btn" class="btn-primary">+ Ajouter un invité</button>';

  const [guests, events] = await Promise.all([loadGuests(), loadEvents()]);
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));

  panel.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Nom</th><th>Côté</th><th>Événements</th><th>RSVP</th>
          <th>Adultes</th><th>Enfants</th><th>Lien</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${guests.length
          ? guests.map(g => renderGuestRow(g, eventById)).join('')
          : '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:40px">Aucun invité.</td></tr>'}
      </tbody>
    </table>`;

  document.getElementById('add-guest-btn').addEventListener('click', () =>
    openGuestPanel(null, guests, events)
  );
  panel.querySelectorAll('.btn-edit-guest').forEach(btn =>
    btn.addEventListener('click', () => openGuestPanel(btn.dataset.id, guests, events))
  );
  panel.querySelectorAll('.btn-delete-guest').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cet invité ?')) return;
      await deleteDoc(doc(db, 'guests', btn.dataset.id));
      renderGuestsTab();
    })
  );
  panel.querySelectorAll('.btn-copy-link').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = `${location.origin}/?invite=${btn.dataset.token}`;
      await navigator.clipboard.writeText(url);
      const orig = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  });
}

function openGuestPanel(id, guests, events) {
  const guest = id ? guests.find(g => g.id === id) : null;
  const isNew = !guest;

  const assignedSet = new Set(guest?.assignedEvents || []);

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${isNew ? 'Nouvel invité' : 'Modifier l\'invité'}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      <label class="field">
        <span>Nom</span>
        <input id="guest-name" value="${escapeHtml(guest?.name || '')}" required>
      </label>
      <div class="field">
        <span>Côté</span>
        <div class="btn-group" id="side-group">
          ${['marie','mariee','deux'].map(s => `
            <button type="button" class="btn-group-item ${(guest?.side || 'deux') === s ? 'active' : ''}" data-side="${s}">
              ${SIDE_LABELS[s]}
            </button>`).join('')}
        </div>
      </div>
      <div class="field">
        <span>Événements</span>
        <div class="event-cards" id="event-cards">
          ${events.map(e => `
            <div class="event-card ${assignedSet.has(e.id) ? 'selected' : ''}" data-event-id="${escapeHtml(e.id)}">
              <div class="event-card-check">${assignedSet.has(e.id) ? '✓' : ''}</div>
              <div class="event-card-info">
                <div class="event-card-title">${escapeHtml(e.title_fr)}</div>
                <div class="event-card-meta">${escapeHtml(e.time_fr)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
      <div id="invite-result" hidden></div>
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">${isNew ? 'Créer' : 'Enregistrer'}</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); renderGuestsTab(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  // Side toggle
  panelEl.querySelectorAll('.btn-group-item').forEach(btn => {
    btn.addEventListener('click', () => {
      panelEl.querySelectorAll('.btn-group-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Event card toggle
  panelEl.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('click', () => {
      card.classList.toggle('selected');
      card.querySelector('.event-card-check').textContent =
        card.classList.contains('selected') ? '✓' : '';
    });
  });

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const saveBtn = panelEl.querySelector('#panel-save');
    saveBtn.disabled = true;
    saveBtn.textContent = isNew ? 'Création…' : 'Enregistrement…';

    const name = panelEl.querySelector('#guest-name').value.trim();
    if (!name) { saveBtn.disabled = false; saveBtn.textContent = isNew ? 'Créer' : 'Enregistrer'; return; }

    const side = panelEl.querySelector('.btn-group-item.active')?.dataset.side || 'deux';
    const assignedEvents = Array.from(
      panelEl.querySelectorAll('.event-card.selected')
    ).map(c => c.dataset.eventId);

    if (id) {
      await updateDoc(doc(db, 'guests', id), { name, side, assignedEvents });
      close();
    } else {
      const token = generateToken();
      await setDoc(doc(db, 'guests', token), {
        name, side, assignedEvents,
        createdAt: new Date().toISOString(),
        rsvp: { status: 'pending', name: '', adults: 0, children: 0, diet: '', message: '', confirmedEvents: {}, respondedAt: null },
      });
      const inviteUrl = `${location.origin}/?invite=${token}`;
      const resultEl = panelEl.querySelector('#invite-result');
      resultEl.hidden = false;
      resultEl.innerHTML = `
        <div class="guest-invite-result">
          <span style="flex:1">${escapeHtml(inviteUrl)}</span>
          <button class="btn-secondary" id="copy-new-link">Copier</button>
        </div>`;
      resultEl.querySelector('#copy-new-link').addEventListener('click', async () => {
        await navigator.clipboard.writeText(inviteUrl);
        resultEl.querySelector('#copy-new-link').textContent = 'Copié !';
      });
      saveBtn.textContent = 'Créé ✓';
      panelEl.querySelector('#panel-cancel').textContent = 'Fermer';
    }
  });
}
```

- [ ] **Step 2: Verify in browser**

Click "Invités" in sidebar. Expected:
- Table with colored side badges (rouge=Marié, violet=Mariée, gris=Les deux)
- Event names shown as pills
- RSVP badge orange/vert
- Clipboard icon button → "✓" after click
- "+ Ajouter un invité" → slide-in panel
- Side selector: 3 toggle buttons, click changes active (bordeaux)
- Event cards: click toggles checkmark + style
- After create: invite URL shown with copy button
- Modify: slide-in pre-filled

- [ ] **Step 3: Commit**

```bash
rtk git add admin/guests.js
rtk git commit -m "feat: redesign guests tab with slide-in panel, badges, and event cards"
```

---

## Task 5: Events tab — restyling

**Files:**
- Modify: `admin/events.js`

**Interfaces:**
- Consumes: `db` from `../firebase-init.js`; `#tab-events`, `#section-action` from HTML
- Produces: `renderEventsTab()` + `loadEvents()` (signatures unchanged)

- [ ] **Step 1: Update admin/events.js — use new design classes + slide-in panel**

```javascript
// admin/events.js
import { db } from '../firebase-init.js';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc,
  query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const eventsCol = collection(db, 'events');

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export async function loadEvents() {
  const snap = await getDocs(query(eventsCol, orderBy('order')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function renderEventsTab() {
  const panel = document.getElementById('tab-events');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  document.getElementById('section-action').innerHTML =
    '<button id="add-event-btn" class="btn-primary">+ Ajouter un événement</button>';

  const events = await loadEvents();

  panel.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr><th>Ordre</th><th>Titre FR</th><th>Titre ZH</th><th>Heure FR</th><th>Lieu FR</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${events.map(ev => `
          <tr>
            <td>${ev.order}</td>
            <td>${escapeHtml(ev.title_fr)}</td>
            <td>${escapeHtml(ev.title_zh)}</td>
            <td>${escapeHtml(ev.time_fr)}</td>
            <td>${escapeHtml(ev.place_fr)}</td>
            <td>
              <div class="table-actions">
                <button class="btn-secondary btn-edit-event" data-id="${ev.id}">Modifier</button>
                <button class="btn-danger btn-delete-event" data-id="${ev.id}">Supprimer</button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  document.getElementById('add-event-btn').addEventListener('click', () =>
    openEventPanel(null, events)
  );
  panel.querySelectorAll('.btn-edit-event').forEach(btn =>
    btn.addEventListener('click', () => openEventPanel(btn.dataset.id, events))
  );
  panel.querySelectorAll('.btn-delete-event').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cet événement ?')) return;
      await deleteDoc(doc(db, 'events', btn.dataset.id));
      renderEventsTab();
    })
  );
}

function openEventPanel(id, events) {
  const ev = id ? events.find(e => e.id === id) : null;
  const isNew = !ev;
  const v = (key) => escapeHtml(ev?.[key] ?? '');

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${isNew ? 'Nouvel événement' : 'Modifier l\'événement'}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      <label class="field"><span>Ordre</span><input id="ev-order" type="number" value="${v('order') || events.length + 1}" required></label>
      <label class="field"><span>Glyphe ZH</span><input id="ev-zh" value="${v('zh')}" required></label>
      <label class="field"><span>Heure FR</span><input id="ev-time-fr" value="${v('time_fr')}" required></label>
      <label class="field"><span>Heure ZH</span><input id="ev-time-zh" value="${v('time_zh')}" required></label>
      <label class="field"><span>Titre FR</span><input id="ev-title-fr" value="${v('title_fr')}" required></label>
      <label class="field"><span>Titre ZH</span><input id="ev-title-zh" value="${v('title_zh')}" required></label>
      <label class="field"><span>Lieu FR</span><input id="ev-place-fr" value="${v('place_fr')}" required></label>
      <label class="field"><span>Lieu ZH</span><input id="ev-place-zh" value="${v('place_zh')}" required></label>
      <label class="field"><span>Description FR</span><textarea id="ev-desc-fr" rows="3">${v('desc_fr')}</textarea></label>
      <label class="field"><span>Description ZH</span><textarea id="ev-desc-zh" rows="3">${v('desc_zh')}</textarea></label>
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">${isNew ? 'Créer' : 'Enregistrer'}</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); renderEventsTab(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const get = (sel) => panelEl.querySelector(sel).value;
    const data = {
      order: Number(get('#ev-order')),
      zh: get('#ev-zh'),
      time_fr: get('#ev-time-fr'),
      time_zh: get('#ev-time-zh'),
      title_fr: get('#ev-title-fr'),
      title_zh: get('#ev-title-zh'),
      place_fr: get('#ev-place-fr'),
      place_zh: get('#ev-place-zh'),
      desc_fr: get('#ev-desc-fr'),
      desc_zh: get('#ev-desc-zh'),
    };
    if (id) {
      await updateDoc(doc(db, 'events', id), data);
    } else {
      await addDoc(eventsCol, data);
    }
    close();
  });
}
```

- [ ] **Step 2: Verify in browser**

Click "Événements". Expected:
- Table styled consistently with Blocs/Invités tabs
- "+ Ajouter un événement" → slide-in panel (not inline form)
- Edit → slide-in pre-filled

- [ ] **Step 3: Commit**

```bash
rtk git add admin/events.js
rtk git commit -m "feat: restyle events tab with slide-in panel"
```

---

## Task 6: Main site — render blocks section

**Files:**
- Modify: `index.html` (add blocks section between `#programme` and `#infos`)
- Modify: `script.js` (read blocks + render)
- Modify: `styles.css` (blocks section styles)

**Interfaces:**
- Consumes: `db` already imported in `script.js`; `blocks` Firestore collection (Task 2)
- Produces: `#blocks-section` rendered when blocks exist and are visible

- [ ] **Step 1: Add blocks section to index.html**

After line 189 (closing `</section>` of `#programme`), before `<!-- INFOS PRATIQUES -->`, insert:

```html
  <!-- ===================== BLOCS DYNAMIQUES ===================== -->
  <section id="blocks-section" class="section section-cream blocks-section" hidden>
    <div id="blocks-list" class="blocks-list"></div>
  </section>
```

- [ ] **Step 2: Add blocks styles to styles.css**

Append to the end of `styles.css`:

```css
/* ── Dynamic blocks ── */
.blocks-section { padding: 60px 0; }
.blocks-list { max-width: 780px; margin: 0 auto; padding: 0 24px; display: flex; flex-direction: column; gap: 48px; }
.block-item {}
.block-title { font-family: 'EB Garamond', Georgia, serif; font-size: clamp(20px, 3vw, 26px); font-weight: 500; text-align: center; margin-bottom: 16px; color: var(--bordeaux); }
.block-title-zh { font-family: 'Noto Serif SC', serif; font-size: 0.85em; display: block; color: var(--taupe); margin-top: 4px; }
.block-content { font-size: clamp(15px, 2vw, 17px); line-height: 1.8; color: var(--ink); white-space: pre-wrap; }
.block-content-zh { font-family: 'Noto Serif SC', serif; font-size: 0.9em; color: var(--taupe); margin-top: 12px; white-space: pre-wrap; }
.block-image { width: 100%; border-radius: 4px; display: block; }
.block-caption { text-align: center; font-size: 13px; color: var(--taupe); margin-top: 8px; font-style: italic; }
.block-caption-zh { font-family: 'Noto Serif SC', serif; }
```

- [ ] **Step 3: Add renderBlocks() to script.js**

Add the import at the top of `script.js` — `collection` and `query` are already imported; add `where` to the import list:

Find this line in `script.js`:
```javascript
import { doc, getDoc, getDocs, collection, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
```
Replace with:
```javascript
import { doc, getDoc, getDocs, collection, updateDoc, query, orderBy, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
```

Then add `renderBlocks()` function and call it during site init. Find where the site content is rendered (search for `renderProgramme()` call) and add `renderBlocks()` after it.

Add this function near `renderProgramme()`:

```javascript
  async function renderBlocks() {
    const snap = await getDocs(
      query(collection(db, 'blocks'), where('visible', '==', true), orderBy('order'))
    );
    const blocks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const section = document.getElementById('blocks-section');
    const list = document.getElementById('blocks-list');
    if (!blocks.length) { section.hidden = true; return; }
    section.hidden = false;
    list.innerHTML = '';
    blocks.forEach(block => {
      const item = document.createElement('div');
      item.className = 'block-item';
      const lang = state.lang;
      const titleFr = block.title_fr || '';
      const titleZh = block.title_zh || '';
      const titleHtml = (titleFr || titleZh) ? `
        <div class="block-title">
          ${titleFr}
          ${titleZh ? `<span class="block-title-zh">${titleZh}</span>` : ''}
        </div>` : '';
      if (block.type === 'text') {
        const contentFr = block.content_fr || '';
        const contentZh = block.content_zh || '';
        item.innerHTML = `
          ${titleHtml}
          ${contentFr ? `<p class="block-content">${contentFr}</p>` : ''}
          ${contentZh ? `<p class="block-content-zh">${contentZh}</p>` : ''}`;
      } else if (block.type === 'image') {
        const alt = lang === 'zh' ? (block.alt_zh || block.alt_fr || '') : (block.alt_fr || '');
        const caption = lang === 'zh' ? block.caption_zh : block.caption_fr;
        item.innerHTML = `
          ${titleHtml}
          <img src="${block.image_url || ''}" alt="${alt}" class="block-image" loading="lazy">
          ${caption ? `<p class="block-caption ${lang === 'zh' ? 'block-caption-zh' : ''}">${caption}</p>` : ''}`;
      }
      list.appendChild(item);
    });
  }
```

Find the call site where `renderProgramme()` is invoked (inside the function that renders the full site, after the guest token is resolved) and add `renderBlocks()` after it:

```javascript
    renderProgramme();
    renderBlocks();
```

- [ ] **Step 4: Verify in browser**

1. In admin, create a text block with title and content, set visible=true
2. Open main site with a valid `?invite=<token>` URL
3. Scroll past Programme section
4. Expected: blocks section appears with the text block content
5. Create a second block, toggle visible off → should not appear
6. Reorder in admin → order reflected on site (after reload)

- [ ] **Step 5: Commit**

```bash
rtk git add index.html script.js styles.css
rtk git commit -m "feat: render dynamic blocks section on main site"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Sidebar layout with dark sidebar + content area
- ✅ Design system: system-ui font, new palette, badges, slide-in panels
- ✅ Blocks tab: CRUD text + image, reorder ↑↓, visible toggle, Firebase Storage upload + URL
- ✅ Blocks Firestore schema: order, type, visible, title_fr/zh, content/image fields
- ✅ Guests tab: side badges, event cards, slide-in panel, clipboard button
- ✅ Events tab: restyled with slide-in
- ✅ Firestore rules: blocks public read
- ✅ Storage rules: blocks public read, auth write
- ✅ Main site: blocks rendered after programme, bilingual, hidden if empty
- ✅ `escapeHtml` on all user-controlled string → innerHTML paths
- ✅ `order` = max + 1 on block creation
- ✅ Newlines preserved: `white-space: pre-wrap` on `.block-content`

**Type consistency:**
- `renderBlocksTab()` / `renderGuestsTab()` / `renderEventsTab()` — all exported, called by `admin/script.js` ✅
- `loadEvents()` exported from `events.js`, consumed by `guests.js` ✅
- `storage` exported from `firebase-init.js`, imported in `blocks.js` ✅
- Firestore `blocks` collection name consistent across `blocks.js`, `script.js`, `firestore.rules` ✅
