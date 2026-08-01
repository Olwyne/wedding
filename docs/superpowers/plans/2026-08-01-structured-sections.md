# Structured Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mis-seeded generic `blocks` (10 static sections flattened into one `type:'text'` field each) with a proper `sections` Firestore collection — one doc per section type, fields matching that section's real structure, including repeatable list fields (places/hotels/avoid-colors) — and wire the front site + admin to read/write it.

**Architecture:** New `sections` collection (11 singleton docs, ID = type name). Front (`script.js`) fetches all 11 once at `init()`, overrides the existing `data-i18n` text pipeline and the three hardcoded list renderers (places/hotels/avoid-colors) with Firestore values when present, falling back to today's hardcoded `T.fr`/`T.zh`/`PLACES`/`HOTELS`/`T.avoid` values when a doc/field is missing. New admin tab "Sections" (`admin/sections.js`) provides a fixed list of the 11 sections with a slide-in edit panel per type, built from a small per-type field schema (reuses `.panel`/`.field`/`.toggle` styles already in `admin/styles.css`).

**Tech Stack:** Vanilla JS (ES modules), Firebase v10.7.1 modular SDK (Firestore), no build step, no test framework (static site — verification is manual, matches existing project convention).

## Global Constraints

- No automated test framework in this repo — every task's "test" step is a manual browser verification, not an automated test run. Spec: `docs/superpowers/specs/2026-08-01-structured-sections-design.md` §9.
- Firestore doc fields follow the `${field}_fr` / `${field}_zh` naming convention exactly as defined in the spec §3 — do not deviate (front and admin code both key off this).
- `sections` is a **singleton** collection: 11 fixed doc IDs (`teaser, hero, story, programme, infos, hebergement, rsvp, gift, dress, gallery, contact`). No create/delete/reorder UI — only edit + visible toggle.
- Every front render path must fall back to the current hardcoded value when the Firestore doc or field is absent/empty — the site must never break before/during seeding.
- `firestore.rules` changes require `firebase deploy --only firestore:rules` to take effect — this plan writes the rule but treats the actual deploy, and any production data deletion, as an action requiring the user's explicit go-ahead at execution time (destructive / shared-infra actions).

---

## File Structure

| File | Change |
|---|---|
| `firestore.rules` | Add `sections` collection rule |
| `script.js` | Add `fetchSections()`, `sectionsMap`, `SECTION_TEXT_MAP` override in `applyText()`, `SECTION_DOM_ID` + `applySectionVisibility()`; migrate `renderPlaces()`/`renderHotels()`/`renderAvoidColors()` to read `sectionsMap` first |
| `index.html` | Remove obsolete `#blocks-public` div |
| `admin/blocks.js` | Remove `audience` subtab UI (public teaser role now owned by `sections/teaser`) — Blocs reverts to single list, invite-only, per original spec |
| `admin/sections.js` (new) | `SECTION_TYPES` schema, `renderSectionsTab()`, slide-in panel with scalar + repeatable-list fields, save via `setDoc` |
| `admin/index.html` | Add "Sections" sidebar nav item + `#tab-sections` panel |
| `admin/script.js` | Import + wire `renderSectionsTab` |
| `admin/styles.css` | Small addition: `.section-list-item` / `.section-list-add` rules for the repeatable list editor |
| `seed.html` | Replace both `blocks` seeders with one `sections` seeder (11 docs, initial values = today's hardcoded text) |

---

### Task 1: Firestore security rules for `sections`

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Produces: `sections/{id}` read/write rule other tasks' Firestore calls depend on.

- [ ] **Step 1: Add the rule**

In `firestore.rules`, add a new `match` block inside `match /databases/{database}/documents { ... }`, alongside the existing `blocks` block:

```
    match /blocks/{blockId} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /sections/{sectionId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
```

- [ ] **Step 2: Verify rule syntax**

Run: `firebase deploy --only firestore:rules --dry-run` if the CLI supports it in this environment, otherwise visually confirm the block matches the exact structure/indentation of the existing `blocks` block (mismatched braces are the only realistic syntax failure here).

- [ ] **Step 3: Deploy — ask before running**

This changes production security rules. Confirm with the user, then run:

```bash
firebase deploy --only firestore:rules
```

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat: add Firestore rules for sections collection"
```

---

### Task 2: Front data layer — fetch sections, override text, toggle visibility

**Files:**
- Modify: `script.js:2` (import), `script.js:104-116` (near `state`), `script.js:202-213` (`applyText`), `script.js:417-424` (near `fetchBlocks`), `script.js:486-499` (`fullRender`), `script.js:501-519` (`init`)

**Interfaces:**
- Produces: `sectionsMap` (module-scope object, keyed by section type, each value = Firestore doc data or `undefined`), `fetchSections()` (async, populates `sectionsMap`), `applySectionVisibility()` (hides/shows section DOM nodes per `visible` field).
- Consumes: existing `T.fr`/`T.zh` translation object, existing `state.lang`, existing `applyText()`/`fullRender()`/`init()` structure.

- [ ] **Step 1: Add `sectionsMap` and `fetchSections()`**

In `script.js`, right after the existing block-caching code (currently `let cachedBlocks = null;` followed by `async function fetchBlocks() { ... }`), add:

```javascript
  let sectionsMap = {};

  async function fetchSections() {
    const snap = await getDocs(collection(db, 'sections'));
    sectionsMap = {};
    snap.docs.forEach(d => { sectionsMap[d.id] = d.data(); });
  }
```

- [ ] **Step 2: Add the scalar text override map**

Add this constant near the top of `script.js`, after the `T` translations object closes (after the `};` that ends the `const T = { fr: {...}, zh: {...} };` block, i.e. right after line 78):

```javascript
  const SECTION_TEXT_MAP = {
    pubKicker: ['teaser', 'kicker'], pubMsg: ['teaser', 'message'],
    heroKicker: ['hero', 'kicker'], heroPlace: ['hero', 'place'], heroFusion: ['hero', 'fusion'],
    envInvite: ['hero', 'envInvite'], envHint: ['hero', 'envHint'],
    storyKicker: ['story', 'kicker'], storyTitle: ['story', 'title'], storyP1: ['story', 'p1'], storyP2: ['story', 'p2'],
    progKicker: ['programme', 'kicker'], progTitle: ['programme', 'title'], progSub: ['programme', 'subtitle'],
    infoKicker: ['infos', 'kicker'], infoTitle: ['infos', 'title'], mapBtn: ['infos', 'mapBtnLabel'],
    hotelKicker: ['hebergement', 'kicker'], hotelTitle: ['hebergement', 'title'], hotelIntro: ['hebergement', 'intro'], shuttle: ['hebergement', 'shuttle'],
    rsvpKicker: ['rsvp', 'kicker'], rsvpTitle: ['rsvp', 'title'], rsvpIntro: ['rsvp', 'intro'],
    giftKicker: ['gift', 'kicker'], giftTitle: ['gift', 'title'], giftText: ['gift', 'text'],
    dressKicker: ['dress', 'kicker'], dressTitle: ['dress', 'title'], dressText: ['dress', 'text'],
    galKicker: ['gallery', 'kicker'], galTitle: ['gallery', 'title'], galHint: ['gallery', 'hint'],
    contactTitle: ['contact', 'title'], contactText: ['contact', 'text'],
  };

  const SECTION_DOM_ID = {
    teaser: 'teaser', hero: 'top', story: 'histoire', programme: 'programme',
    infos: 'infos', hebergement: 'hebergement', rsvp: 'rsvp', gift: 'cadeau',
    dress: 'dresscode', gallery: 'galerie', contact: 'contact',
  };
```

- [ ] **Step 3: Apply the override inside `applyText()`**

Current `applyText()` (`script.js:202-213`):

```javascript
  function applyText() {
    const L = T[state.lang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (L[key] !== undefined) el.textContent = L[key];
    });
    document.getElementById('lang-btn').textContent = L.langBtn;
    document.getElementById('lang-btn-teaser').textContent = L.langBtn;
    document.getElementById('r-name').placeholder = L.fNamePh;
    document.getElementById('r-diet').placeholder = L.fDietPh;
    document.getElementById('r-msg').placeholder = L.fMsgPh;
  }
```

Change the `forEach` body to also check `SECTION_TEXT_MAP`:

```javascript
  function applyText() {
    const L = T[state.lang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (L[key] !== undefined) el.textContent = L[key];
      const map = SECTION_TEXT_MAP[key];
      if (map) {
        const [type, field] = map;
        const suffix = state.lang === 'zh' ? '_zh' : '_fr';
        const val = sectionsMap[type]?.[field + suffix];
        if (val) el.textContent = val;
      }
    });
    document.getElementById('lang-btn').textContent = L.langBtn;
    document.getElementById('lang-btn-teaser').textContent = L.langBtn;
    document.getElementById('r-name').placeholder = L.fNamePh;
    document.getElementById('r-diet').placeholder = L.fDietPh;
    document.getElementById('r-msg').placeholder = L.fMsgPh;
  }
```

- [ ] **Step 4: Add `applySectionVisibility()` and call it from `fullRender()`**

Add this function near `applyText()`:

```javascript
  function applySectionVisibility() {
    Object.entries(SECTION_DOM_ID).forEach(([type, id]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.hidden = sectionsMap[type]?.visible === false;
    });
  }
```

In `fullRender()` (`script.js:486-499`), add the call after `applyText()`:

```javascript
  function fullRender() {
    applyText();
    applySectionVisibility();
    renderNav();
    renderProgramme();
    applyBlocks();
    renderRsvpEvents();
    renderPlaces();
    renderHotels();
    renderAvoidColors();
    renderConfirmLine();
    renderRsvpFormState();
    renderCountdown();
    renderAccessView();
  }
```

- [ ] **Step 5: Fetch sections at init**

In `init()` (`script.js:501-519`), add `fetchSections()` to the parallel fetch:

```javascript
  async function init() {
    showLoading(true);
    await Promise.all([
      loadGuestData(),
      fetchBlocks().catch(err => console.error('fetchBlocks failed:', err)),
      fetchSections().catch(err => console.error('fetchSections failed:', err)),
    ]);
    state.dataReady = true;
    showLoading(false);
    ...
```

(Keep the rest of `init()` unchanged.)

- [ ] **Step 6: Manual verification**

Serve the repo root with any static file server (e.g. `python3 -m http.server 8000`), open `index.html` in a browser. With no `sections` docs in Firestore yet, the site must render identically to before (all fallback values). Check the browser console for no errors.

- [ ] **Step 7: Commit**

```bash
git add script.js
git commit -m "feat: fetch sections collection, override text + visibility with fallback"
```

---

### Task 3: Front list rendering — places, hotels, avoid-colors

**Files:**
- Modify: `script.js:282-296` (`renderPlaces`), `script.js:298-310` (`renderHotels`), `script.js:312-322` (`renderAvoidColors`)

**Interfaces:**
- Consumes: `sectionsMap` from Task 2 (`sectionsMap.infos.places`, `sectionsMap.hebergement.hotels`, `sectionsMap.dress.avoidColors` — each an array or `undefined`).

- [ ] **Step 1: Migrate `renderPlaces()`**

Current (`script.js:282-296`):

```javascript
  function renderPlaces() {
    const L = T[state.lang];
    const grid = document.getElementById('places-grid');
    grid.innerHTML = '';
    PLACES[state.lang].forEach(pl => {
      const card = document.createElement('div');
      card.className = 'place-card';
      card.innerHTML = `
        <div class="cal place-zh">${pl.zh}</div>
        <h3 class="place-name">${pl.name}</h3>
        <p class="place-addr">${pl.addr}</p>
        <a href="${pl.map}" target="_blank" rel="noopener" class="place-map-btn">${L.mapBtn}</a>`;
      grid.appendChild(card);
    });
  }
```

Replace with:

```javascript
  function renderPlaces() {
    const L = T[state.lang];
    const grid = document.getElementById('places-grid');
    grid.innerHTML = '';
    const mapBtnLabel = sectionsMap.infos?.[state.lang === 'zh' ? 'mapBtnLabel_zh' : 'mapBtnLabel_fr'] || L.mapBtn;
    const items = sectionsMap.infos?.places?.length
      ? sectionsMap.infos.places.map(p => ({
          zh: p.zh,
          name: state.lang === 'zh' ? (p.name_zh || p.name_fr) : (p.name_fr || p.name_zh),
          addr: state.lang === 'zh' ? (p.addr_zh || p.addr_fr) : (p.addr_fr || p.addr_zh),
          map: p.mapUrl,
        }))
      : PLACES[state.lang];
    items.forEach(pl => {
      const card = document.createElement('div');
      card.className = 'place-card';
      card.innerHTML = `
        <div class="cal place-zh">${pl.zh}</div>
        <h3 class="place-name">${pl.name}</h3>
        <p class="place-addr">${pl.addr}</p>
        <a href="${pl.map}" target="_blank" rel="noopener" class="place-map-btn">${mapBtnLabel}</a>`;
      grid.appendChild(card);
    });
  }
```

- [ ] **Step 2: Migrate `renderHotels()`**

Current (`script.js:298-310`):

```javascript
  function renderHotels() {
    const grid = document.getElementById('hotels-grid');
    grid.innerHTML = '';
    HOTELS[state.lang].forEach(h => {
      const card = document.createElement('div');
      card.className = 'hotel-card';
      card.innerHTML = `
        <div class="hotel-tag">${h.tag}</div>
        <h3 class="hotel-name">${h.name}</h3>
        <p class="hotel-desc">${h.desc}</p>`;
      grid.appendChild(card);
    });
  }
```

Replace with:

```javascript
  function renderHotels() {
    const grid = document.getElementById('hotels-grid');
    grid.innerHTML = '';
    const items = sectionsMap.hebergement?.hotels?.length
      ? sectionsMap.hebergement.hotels.map(h => ({
          tag: state.lang === 'zh' ? (h.tag_zh || h.tag_fr) : (h.tag_fr || h.tag_zh),
          name: state.lang === 'zh' ? (h.name_zh || h.name_fr) : (h.name_fr || h.name_zh),
          desc: state.lang === 'zh' ? (h.desc_zh || h.desc_fr) : (h.desc_fr || h.desc_zh),
        }))
      : HOTELS[state.lang];
    items.forEach(h => {
      const card = document.createElement('div');
      card.className = 'hotel-card';
      card.innerHTML = `
        <div class="hotel-tag">${h.tag}</div>
        <h3 class="hotel-name">${h.name}</h3>
        <p class="hotel-desc">${h.desc}</p>`;
      grid.appendChild(card);
    });
  }
```

- [ ] **Step 3: Migrate `renderAvoidColors()`**

Current (`script.js:312-322`):

```javascript
  function renderAvoidColors() {
    const L = T[state.lang];
    const wrap = document.getElementById('avoid-colors');
    wrap.innerHTML = '';
    L.avoid.forEach(c => {
      const chip = document.createElement('span');
      chip.className = 'avoid-chip';
      chip.innerHTML = `<span class="avoid-swatch" style="background:${c.hex}"></span>${c.label}`;
      wrap.appendChild(chip);
    });
  }
```

Replace with:

```javascript
  function renderAvoidColors() {
    const L = T[state.lang];
    const wrap = document.getElementById('avoid-colors');
    wrap.innerHTML = '';
    const items = sectionsMap.dress?.avoidColors?.length
      ? sectionsMap.dress.avoidColors.map(c => ({
          hex: c.hex,
          label: state.lang === 'zh' ? (c.label_zh || c.label_fr) : (c.label_fr || c.label_zh),
        }))
      : L.avoid;
    items.forEach(c => {
      const chip = document.createElement('span');
      chip.className = 'avoid-chip';
      chip.innerHTML = `<span class="avoid-swatch" style="background:${c.hex}"></span>${c.label}`;
      wrap.appendChild(chip);
    });
  }
```

- [ ] **Step 4: Manual verification**

Reload the site with no `sections` docs present — Infos/Hébergement/Dress-code must render identically to before (fallback arrays). No console errors.

- [ ] **Step 5: Commit**

```bash
git add script.js
git commit -m "feat: migrate places/hotels/avoid-colors lists to sections with fallback"
```

---

### Task 4: Remove obsolete public-teaser block duplication

**Files:**
- Modify: `index.html:56` (remove `#blocks-public` div)
- Modify: `script.js` (`applyBlocks()`, currently around lines 458-484 — remove the "Teaser (public)" half)
- Modify: `admin/blocks.js` (remove `audience` subtab UI — Blocs reverts to single invite-only list)

**Interfaces:**
- Produces: `applyBlocks()` now only handles the invite-audience list (unchanged behavior for `#blocks-section`); `admin/blocks.js` no longer writes/reads an `audience` field.

- [ ] **Step 1: Remove `#blocks-public` markup**

In `index.html`, delete line 56:

```html
  <div id="blocks-public" class="blocks-list blocks-list-teaser" hidden></div>
```

- [ ] **Step 2: Simplify `applyBlocks()` in `script.js`**

Current `applyBlocks()`:

```javascript
  function applyBlocks() {
    const all = cachedBlocks || [];
    const lang = state.lang;

    // Invite site: only audience === 'invite' blocks (or legacy blocks without audience)
    const inviteBlocks = all.filter(b => !b.audience || b.audience === 'invite');
    const section = document.getElementById('blocks-section');
    const list = document.getElementById('blocks-list');
    list.innerHTML = '';
    if (inviteBlocks.length) {
      section.hidden = false;
      inviteBlocks.forEach(b => list.appendChild(buildBlockItem(b, lang)));
    } else {
      section.hidden = true;
    }

    // Teaser (public): only audience === 'public' blocks
    const publicList = document.getElementById('blocks-public');
    const publicBlocks = all.filter(b => b.audience === 'public');
    publicList.innerHTML = '';
    if (publicBlocks.length) {
      publicList.hidden = false;
      publicBlocks.forEach(b => publicList.appendChild(buildBlockItem(b, lang)));
    } else {
      publicList.hidden = true;
    }
  }
```

Replace with:

```javascript
  function applyBlocks() {
    const all = cachedBlocks || [];
    const lang = state.lang;
    const section = document.getElementById('blocks-section');
    const list = document.getElementById('blocks-list');
    list.innerHTML = '';
    if (all.length) {
      section.hidden = false;
      all.forEach(b => list.appendChild(buildBlockItem(b, lang)));
    } else {
      section.hidden = true;
    }
  }
```

Also change `fetchBlocks()` — the `where('visible','==',true)` filter should stay, but the `audience` field no longer needs filtering client-side since only invite-audience blocks are fetched for a purpose now. No change needed there (query already only filters `visible`); the filtering by audience happened in `applyBlocks()`, now removed since there's only one audience left in practice.

- [ ] **Step 3: Revert `admin/blocks.js` to a single invite-only list**

Read the current full file (`admin/blocks.js`) before editing — it has an `activeAudience` subtab toggle (`'invite'`/`'public'`) introduced for the now-redundant public-teaser-block feature.

Remove `activeAudience` state and the subtab nav. Specifically:

Replace:
```javascript
const blocksCol = collection(db, 'blocks');
let activeAudience = 'invite';
```
with:
```javascript
const blocksCol = collection(db, 'blocks');
```

Replace the body of `renderBlocksTab()` from:
```javascript
  const filtered = allBlocks.filter(b => (b.audience || 'invite') === activeAudience);

  document.getElementById('section-action').innerHTML =
    '<button id="add-block-btn" class="btn-primary">+ Ajouter un bloc</button>';

  const desc = activeAudience === 'invite'
    ? 'Blocs visibles pour les invités ayant un lien personnel'
    : 'Blocs visibles sur la page publique (sans lien d\'invitation)';

  panel.innerHTML = `
    <div class="subtab-nav">
      <button class="subtab-btn ${activeAudience === 'invite' ? 'active' : ''}" data-aud="invite">
        🔒 Vue connectée
      </button>
      <button class="subtab-btn ${activeAudience === 'public' ? 'active' : ''}" data-aud="public">
        🌐 Vue non connectée
      </button>
    </div>
    <p class="subtab-desc">${escapeHtml(desc)}</p>
    <table class="admin-table">
```
to:
```javascript
  const filtered = allBlocks;

  document.getElementById('section-action').innerHTML =
    '<button id="add-block-btn" class="btn-primary">+ Ajouter un bloc</button>';

  panel.innerHTML = `
    <p class="subtab-desc">Contenu additionnel affiché après le programme, sur le site invité.</p>
    <table class="admin-table">
```

Remove the subtab click-binding block:
```javascript
  panel.querySelectorAll('.subtab-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      activeAudience = btn.dataset.aud;
      renderBlocksTab();
    })
  );

```
(delete this whole block).

Replace remaining references to `activeAudience` with the literal `'invite'`:
- `openBlockPanel(null, allBlocks, activeAudience)` → `openBlockPanel(null, allBlocks, 'invite')`
- `openBlockPanel(btn.dataset.id, allBlocks, activeAudience)` → `openBlockPanel(btn.dataset.id, allBlocks, 'invite')`

In `openBlockPanel(id, allBlocks, audience)`, the `audLabel` line and its `<p>` in the header become unnecessary (only one audience now) — remove:
```javascript
  const audLabel = audience === 'public' ? '🌐 Vue non connectée' : '🔒 Vue connectée';
```
and remove the `<p style="font-size:12px;color:var(--muted);margin-top:2px">${audLabel}</p>` line from the panel header template.

`saveBlock(id, filteredBlocks, panelEl, audience)` keeps writing `audience` — leave this as-is (harmless, always `'invite'` now, avoids touching Firestore write shape / rules).

- [ ] **Step 4: Manual verification**

Reload `index.html` — teaser view must show `sections/teaser` content only (no `#blocks-public`, no console error about missing element). Reload `admin/index.html` → Blocs tab — must show a single list, no subtab buttons, "+ Ajouter un bloc" still creates a block visible on `#blocks-section` on the invite site.

- [ ] **Step 5: Commit**

```bash
git add index.html script.js admin/blocks.js
git commit -m "fix: drop redundant public-teaser block path, sections/teaser owns that content"
```

---

### Task 5: Admin — new Sections tab (list view + scalar-field edit panel)

**Files:**
- Create: `admin/sections.js`
- Modify: `admin/styles.css` (append list-editor rules)

**Interfaces:**
- Produces: `export async function renderSectionsTab()` — same shape as `renderBlocksTab()`/`renderGuestsTab()`/`renderEventsTab()`, called by `admin/script.js`'s nav dispatcher (wired in Task 7).
- Consumes: `db` from `../firebase-init.js`, Firestore `doc`, `getDoc`, `getDocs`, `collection`, `setDoc` (v10.7.1 modular SDK, same import pattern as `admin/blocks.js`).

- [ ] **Step 1: Write `SECTION_TYPES` schema and `escapeHtml` helper**

Create `admin/sections.js`:

```javascript
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
```

- [ ] **Step 2: Write `renderSectionsTab()` (list view)**

Append to `admin/sections.js`:

```javascript
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
```

- [ ] **Step 3: Append the list-editor CSS**

In `admin/styles.css`, append:

```css
.section-list{display:flex;flex-direction:column;gap:12px;margin-bottom:14px}
.section-list-item{border:1px solid var(--admin-border);border-radius:8px;padding:12px;position:relative;display:flex;flex-direction:column;gap:8px}
.section-list-item .btn-remove-item{position:absolute;top:4px;right:4px}
.section-list-add{align-self:flex-start}
```

- [ ] **Step 4: Manual verification (partial — panel body comes in Task 6)**

Confirm the list renders (11 rows, visible toggles work and persist a Firestore write — check the Firestore console or reload the tab and see the toggle state stick). "Modifier" buttons are present but currently no-op (`openSectionPanel` stub) — this is expected until Task 6.

- [ ] **Step 5: Commit**

```bash
git add admin/sections.js admin/styles.css
git commit -m "feat: add Sections admin tab list view with visible toggle"
```

---

### Task 6: Admin — Sections edit panel (scalar fields + repeatable lists) and save

**Files:**
- Modify: `admin/sections.js` (replace the `openSectionPanel` stub from Task 5)

**Interfaces:**
- Consumes: `SECTION_TYPES`, `escapeHtml`, `db`/`doc`/`setDoc` from Task 5's imports.
- Produces: fully working `openSectionPanel(type, sectionsMap)` — the deliverable this task tests.

- [ ] **Step 1: Write scalar-field form builder**

Replace the stub:
```javascript
function openSectionPanel(type, sectionsMap) {
  // implemented in Task 6
}
```
with:

```javascript
function buildScalarFieldHtml(field, data) {
  const vFr = escapeHtml(data?.[`${field.key}_fr`] || '');
  const vZh = escapeHtml(data?.[`${field.key}_zh`] || '');
  const tag = field.kind === 'textarea' ? 'textarea' : 'input';
  const attrs = field.kind === 'textarea' ? 'rows="4"' : '';
  const valAttr = (v) => field.kind === 'textarea' ? `>${v}</textarea>` : ` value="${v}">`;
  return `
    <label class="field">
      <span>${escapeHtml(field.label)} FR</span>
      <${tag} id="sec-${field.key}-fr" ${attrs}${valAttr(vFr)}
    </label>
    <label class="field">
      <span>${escapeHtml(field.label)} ZH</span>
      <${tag} id="sec-${field.key}-zh" ${attrs}${valAttr(vZh)}
    </label>`;
}
```

- [ ] **Step 2: Write the repeatable-list editor builder**

Append:

```javascript
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
      <div class="section-list" id="sec-list-${listDef.key}">${rows}</div>
      <button type="button" class="btn-secondary section-list-add" id="sec-list-add-${listDef.key}">+ Ajouter un item</button>
    </div>`;
}

function readListFromPanel(panelEl, listDef) {
  const items = [];
  panelEl.querySelectorAll(`#sec-list-${listDef.key} .section-list-item`).forEach(row => {
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
  const listEl = panelEl.querySelector(`#sec-list-${def.list.key}`);

  function bindRemoveButtons() {
    listEl.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.onclick = () => { btn.closest('.section-list-item').remove(); };
    });
  }
  bindRemoveButtons();

  panelEl.querySelector(`#sec-list-add-${def.list.key}`).addEventListener('click', () => {
    const idx = listEl.children.length;
    listEl.insertAdjacentHTML('beforeend', buildListItemHtml(def.list, {}, idx));
    bindRemoveButtons();
  });
}
```

- [ ] **Step 3: Write `openSectionPanel()` and save handler**

Replace `buildScalarFieldHtml`'s preceding stub area is already done in Step 1 — now add the panel function itself, placed after `attachListHandlers`:

```javascript
function openSectionPanel(type, sectionsMap) {
  const def = SECTION_TYPES.find(d => d.id === type);
  const data = sectionsMap[type] || {};

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  const scalarHtml = def.fields.map(f => buildScalarFieldHtml(f, data)).join('');
  const listHtml = def.list ? buildListHtml(def.list, data[def.list.key]) : '';

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${escapeHtml(def.label)}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body" id="panel-body">
      ${scalarHtml}
      ${listHtml}
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">Enregistrer</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  attachListHandlers(panelEl, def);

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const saveBtn = panelEl.querySelector('#panel-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Enregistrement…';
    try {
      const payload = { visible: data.visible !== false, updatedAt: new Date().toISOString() };
      def.fields.forEach(f => {
        payload[`${f.key}_fr`] = panelEl.querySelector(`#sec-${f.key}-fr`).value;
        payload[`${f.key}_zh`] = panelEl.querySelector(`#sec-${f.key}-zh`).value;
      });
      if (def.list) {
        payload[def.list.key] = readListFromPanel(panelEl, def.list);
      }
      await setDoc(doc(db, 'sections', type), payload);
      close();
      renderSectionsTab();
    } catch (err) {
      console.error(err);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Enregistrer';
    }
  });
}
```

- [ ] **Step 4: Manual verification**

Open `admin/index.html`, log in, go to Sections tab. For each of the 11 rows: click "Modifier", edit a scalar field, save, reload the tab, confirm the value persisted. For `infos`/`hebergement`/`dress`: add a list item, fill its fields, save, reload, confirm it persisted; remove an item, save, reload, confirm it's gone. Toggle visible off for one section, reload `index.html` on the front, confirm that DOM section is hidden (`el.hidden === true`); toggle back on.

- [ ] **Step 5: Commit**

```bash
git add admin/sections.js admin/styles.css
git commit -m "feat: Sections edit panel — scalar fields + repeatable lists, save to Firestore"
```

---

### Task 7: Wire the Sections tab into the admin shell

**Files:**
- Modify: `admin/index.html:38-48` (sidebar nav), `admin/index.html:58-62` (tab panels)
- Modify: `admin/script.js`

**Interfaces:**
- Consumes: `renderSectionsTab` exported by `admin/sections.js` (Task 5/6).

- [ ] **Step 1: Add the nav item and tab panel**

In `admin/index.html`, inside `<nav class="sidebar-nav">` (currently lines 39-47), add a new button after the "Blocs" button:

```html
      <button class="nav-item" data-section="blocks">
        <span class="nav-icon">⬛</span> Blocs
      </button>
      <button class="nav-item" data-section="sections">
        <span class="nav-icon">🗂️</span> Sections
      </button>
      <button class="nav-item" data-section="guests">
        <span class="nav-icon">👥</span> Invités
      </button>
      <button class="nav-item" data-section="events">
        <span class="nav-icon">📅</span> Événements
      </button>
```

In `<div class="content-body">` (currently lines 58-62), add the new panel:

```html
      <div id="tab-blocks" class="tab-panel"></div>
      <div id="tab-sections" class="tab-panel" hidden></div>
      <div id="tab-guests" class="tab-panel" hidden></div>
      <div id="tab-events" class="tab-panel" hidden></div>
```

- [ ] **Step 2: Import and register in `admin/script.js`**

Current `admin/script.js`:

```javascript
// admin/script.js
import { initAuth } from './auth.js';
import { renderBlocksTab } from './blocks.js?v=2';
import { renderGuestsTab } from './guests.js';
import { renderEventsTab } from './events.js';

const SECTIONS = {
  blocks: { title: 'Blocs', render: renderBlocksTab },
  guests: { title: 'Invités', render: renderGuestsTab },
  events: { title: 'Événements', render: renderEventsTab },
};
```

Replace with:

```javascript
// admin/script.js
import { initAuth } from './auth.js';
import { renderBlocksTab } from './blocks.js?v=2';
import { renderSectionsTab } from './sections.js';
import { renderGuestsTab } from './guests.js';
import { renderEventsTab } from './events.js';

const SECTIONS = {
  blocks: { title: 'Blocs', render: renderBlocksTab },
  sections: { title: 'Sections', render: renderSectionsTab },
  guests: { title: 'Invités', render: renderGuestsTab },
  events: { title: 'Événements', render: renderEventsTab },
};
```

(No change needed to `initNav()` — it already reads `data-section` generically. `onSignedIn` stays `() => renderBlocksTab()` since the default active tab is still Blocs; switching tabs already calls the right `render()` via `initNav()`.)

- [ ] **Step 3: Manual verification**

Reload `admin/index.html`, log in. "Sections" appears in the sidebar between Blocs and Invités. Clicking it shows the 11-row list from Task 5/6. Switching between tabs still works for Blocs/Invités/Événements.

- [ ] **Step 4: Commit**

```bash
git add admin/index.html admin/script.js
git commit -m "feat: wire Sections tab into admin nav"
```

---

### Task 8: Seed script — replace block seeders with a sections seeder

**Files:**
- Modify: `seed.html` (full rewrite of the two seed buttons/scripts)

**Interfaces:**
- Produces: one seed button that creates the 11 `sections/*` docs with today's hardcoded FR/ZH text as initial values (idempotent — refuses if `sections` already has docs, same guard pattern as the current script).

- [ ] **Step 1: Replace the body/buttons**

Replace the two `<h2>`/`<button>`/`<pre>` blocks (`seed.html` lines 19-27) with a single one:

```html
<h2 style="margin:28px 0 8px;font-size:16px">Sections structurées</h2>
<p style="margin-bottom:12px;font-size:14px">Crée les 11 documents <code>sections/*</code> avec le texte actuellement affiché sur le site comme valeur initiale. À utiliser une seule fois.</p>
<button id="seed-sections-btn">Insérer les sections</button>
<pre id="log-sections">En attente…</pre>
```

- [ ] **Step 2: Replace the script body**

Replace the entire `<script type="module">...</script>` block with:

```html
<script type="module">
import { db, auth } from './firebase-init.js';
import { collection, doc, setDoc, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const log = document.getElementById('log-sections');
const btn = document.getElementById('seed-sections-btn');

const SECTIONS = {
  teaser: {
    kicker_fr: 'Save the date', kicker_zh: '敬请留意',
    message_fr: "Nous nous marions ! Les détails du programme sont réservés à nos invités. Si vous avez reçu une invitation, ouvrez le lien personnalisé qui l'accompagne pour découvrir la journée.",
    message_zh: '我们要结婚啦！婚礼行程详情仅向受邀嘉宾开放。若您已收到邀请，请打开随附的专属链接，查看当天的完整安排。',
  },
  hero: {
    kicker_fr: 'Nous nous marions', kicker_zh: '我们结婚啦',
    place_fr: 'Lognes, France', place_zh: '法国 · 洛涅',
    fusion_fr: 'Un mariage franco-chinois', fusion_zh: '中 · 法 喜结良缘',
    envInvite_fr: 'Vous êtes convié·e au mariage de', envInvite_zh: '诚邀您出席我们的婚礼',
    envHint_fr: 'Touchez pour ouvrir votre faire-part', envHint_zh: '轻触开启您的请柬',
  },
  story: {
    kicker_fr: 'Notre histoire', kicker_zh: '我们的故事',
    title_fr: 'Deux cultures, une histoire', title_zh: '两种文化，一段情缘',
    p1_fr: "Nos chemins se sont croisés entre Paris et Shanghai, entre un café en terrasse et une tasse de thé. De cette rencontre est née une évidence, faite de tendresse, de rires et de deux familles qui n'attendaient qu'à se réunir.",
    p1_zh: '我们的缘分在巴黎与上海之间悄然开启——一杯露天咖啡，一盏清茶。自那一刻起，温柔、欢笑与两个家庭的期盼，让一切变得水到渠成。',
    p2_fr: "Aujourd'hui, nous unissons nos vies — et nos traditions. Nous serions honorés de vous compter parmi nous pour célébrer ce jour. (Texte à personnaliser.)",
    p2_zh: '今天，我们携手共度余生，也将两种传统融为一体。诚挚期盼您的到来，与我们共同见证这美好的一天。（内容可自定义。）',
  },
  programme: {
    kicker_fr: 'Le déroulé', kicker_zh: '当日流程',
    title_fr: 'La journée', title_zh: '婚礼当天',
    subtitle_fr: "Le programme ci-dessous correspond aux moments auxquels vous êtes convié·e.", subtitle_zh: '以下行程为您受邀参加的环节。',
  },
  infos: {
    kicker_fr: 'Sur place', kicker_zh: '场地信息',
    title_fr: 'Informations pratiques', title_zh: '实用信息',
    mapBtnLabel_fr: 'Voir sur la carte', mapBtnLabel_zh: '查看地图',
    places: [
      { zh: '证婚', name_fr: 'Mairie de Lognes', name_zh: '洛涅市政厅', addr_fr: "Place de l'Hôtel de Ville, 77185 Lognes", addr_zh: '市政厅广场，77185 洛涅', mapUrl: 'https://www.google.com/maps/search/?api=1&query=Mairie+de+Lognes' },
      { zh: '喜宴', name_fr: 'Domaine de la Pointe', name_zh: '拉普安特庄园', addr_fr: 'Adresse à préciser — région de Lognes', addr_zh: '地址待定 — 洛涅地区', mapUrl: 'https://www.google.com/maps/search/?api=1&query=Domaine+de+la+Pointe' },
    ],
  },
  hebergement: {
    kicker_fr: 'Où dormir', kicker_zh: '住宿',
    title_fr: 'Hébergement & transport', title_zh: '住宿与交通',
    intro_fr: 'Quelques suggestions autour de Lognes et Marne-la-Vallée pour prolonger la fête sereinement. (Exemples à ajuster.)',
    intro_zh: '为您推荐洛涅及马恩拉瓦莱周边的几处住宿，方便您安心欢聚。（示例，可调整。）',
    shuttle_fr: "Une navette pourra être organisée entre la mairie de Lognes et le Domaine de la Pointe selon le nombre d'invités — précisez-le dans votre RSVP.",
    shuttle_zh: '我们将视人数在洛涅市政厅与拉普安特庄园之间安排接驳车，请在回执中注明您的需求。',
    hotels: [
      { tag_fr: '4 km', tag_zh: '4 公里', name_fr: 'Hôtel Marne-la-Vallée', name_zh: '马恩拉瓦莱酒店', desc_fr: 'Confort moderne à quelques minutes du Domaine, idéal pour la nuit du samedi. (Exemple.)', desc_zh: '现代舒适，距庄园仅数分钟，适合周六过夜。（示例。）' },
      { tag_fr: '6 km', tag_zh: '6 公里', name_fr: 'Ibis Noisy-le-Grand', name_zh: '宜必思 Noisy-le-Grand', desc_fr: 'Option pratique et économique, bien desservie par le RER A. (Exemple.)', desc_zh: '实惠便捷，RER A 线交通便利。（示例。）' },
      { tag_fr: '8 km', tag_zh: '8 公里', name_fr: "Maison d'hôtes de charme", name_zh: '精品民宿', desc_fr: 'Pour un séjour plus intimiste, à réserver tôt. (Exemple.)', desc_zh: '更为私密的住宿选择，建议尽早预订。（示例。）' },
    ],
  },
  rsvp: {
    kicker_fr: 'Répondez-nous', kicker_zh: '恳请回复',
    title_fr: 'Confirmez votre présence', title_zh: '确认出席',
    intro_fr: "Merci de répondre avant le 1er juin 2027. Cochez uniquement les moments auxquels vous participerez.",
    intro_zh: '烦请于 2027 年 6 月 1 日前回复。请仅勾选您将参加的环节。',
  },
  gift: {
    kicker_fr: 'Liste de mariage', kicker_zh: '婚礼礼单',
    title_fr: 'Votre présence, notre plus beau cadeau', title_zh: '您的到来便是最好的礼物',
    text_fr: "Si vous souhaitez nous gâter, une boîte sera prévue sur place le jour J pour recueillir vos petits mots et cadeaux. Votre présence reste le plus précieux des présents.",
    text_zh: '若您愿意送上心意，当天现场将备有礼盒，收纳您的祝福与礼物。您的到来，已是最珍贵的礼物。',
  },
  dress: {
    kicker_fr: 'Tenue', kicker_zh: '着装',
    title_fr: 'Dress code', title_zh: '着装建议',
    text_fr: "Tenue habillée et élégante souhaitée. Par respect des traditions de nos deux familles, merci d'éviter le rouge et le blanc/ivoire (réservés aux mariés) ainsi que le noir intégral. Une touche de couleur est la bienvenue !",
    text_zh: '恳请着正式、优雅的服装。为尊重两个家庭的传统，敬请避免红色与白色/象牙色（新人专属）以及全黑装扮。欢迎点缀亮丽色彩！',
    avoidColors: [
      { hex: '#B03A2E', label_fr: 'Rouge', label_zh: '红色' },
      { hex: '#FBF6EC', label_fr: 'Blanc / ivoire', label_zh: '白/象牙色' },
      { hex: '#1a1a1a', label_fr: 'Noir intégral', label_zh: '全黑' },
    ],
  },
  gallery: {
    kicker_fr: 'Souvenirs', kicker_zh: '回忆',
    title_fr: 'Galerie', title_zh: '相册',
    hint_fr: 'Déposez ici vos plus belles photos.', hint_zh: '在此上传您最美的照片。',
  },
  contact: {
    title_fr: 'Une question ?', title_zh: '有疑问吗？',
    text_fr: "N'hésitez pas à nous écrire pour toute question sur la journée, le transport ou l'hébergement.",
    text_zh: '关于当天行程、交通或住宿的任何问题，欢迎随时与我们联系。',
  },
};

btn.addEventListener('click', async () => {
  btn.disabled = true;
  log.textContent = '';

  const user = auth.currentUser;
  if (!user) {
    log.innerHTML = '<span class="err">Non connecté. Connectez-vous d\'abord sur /admin/ dans un autre onglet.</span>';
    btn.disabled = false;
    return;
  }
  log.textContent += `Connecté en tant que ${user.email}\n\n`;

  const col = collection(db, 'sections');
  const existing = await getDocs(col);
  if (existing.size > 0) {
    log.innerHTML += `<span class="err">⚠ La collection contient déjà ${existing.size} section(s). Seed ignoré pour éviter d'écraser des modifications.</span>`;
    btn.disabled = false;
    return;
  }

  const now = new Date().toISOString();
  let ok = 0;
  const types = Object.keys(SECTIONS);
  for (const type of types) {
    try {
      await setDoc(doc(db, 'sections', type), { ...SECTIONS[type], visible: true, createdAt: now, updatedAt: now });
      log.textContent += `✓ Section "${type}"\n`;
      ok++;
    } catch (err) {
      log.innerHTML += `<span class="err">✗ Erreur sur "${type}": ${err.message}</span>\n`;
    }
  }

  log.innerHTML += `\n<span class="${ok === types.length ? 'ok' : 'err'}">${ok}/${types.length} sections créées.</span>`;
  if (ok > 0) {
    log.textContent += '\n\nRetournez sur /admin/ → Sections pour les voir et les modifier.';
  }
  btn.disabled = false;
});

onAuthStateChanged(auth, user => {
  log.textContent = user
    ? `✓ Auth détectée : ${user.email}\nCliquez sur le bouton pour insérer les sections.`
    : '⚠ Non connecté. Connectez-vous sur /admin/ dans un autre onglet, puis revenez ici.';
});
</script>
```

- [ ] **Step 3: Manual verification**

Open `/admin/` in one tab and log in; open `/seed.html` in another tab. Click "Insérer les sections" — expect "11/11 sections créées." in the log. Reload `/admin/` → Sections tab — all 11 rows show data now (not just fallback). Reload the front `index.html` — content should look identical (since seed values match today's hardcoded text) but is now sourced from Firestore (verify via Network tab: a `sections` collection request fires).

- [ ] **Step 4: Commit**

```bash
git add seed.html
git commit -m "feat: replace blocks seeders with a single sections seeder"
```

---

### Task 9: Data cleanup and full end-to-end verification

**Files:** none (Firestore data only + manual checklist)

- [ ] **Step 1: Confirm with the user before deleting anything**

This step deletes production Firestore documents. Do not run it without explicit confirmation: the 10 mis-seeded `blocks` docs (`audience:'invite'`, all `type:'text'`, titles matching the 10 section names) and the 1 duplicate `blocks` doc (`audience:'public'`, title "Save the date").

- [ ] **Step 2: Delete the stale block docs**

Via the Firebase console (Firestore Data tab) or a one-off authenticated script using `deleteDoc`, remove the 11 docs identified in Step 1 from the `blocks` collection. Confirm the Blocs admin tab shows an empty list afterward.

- [ ] **Step 3: Full end-to-end checklist**

- [ ] Front `index.html`, no `?invite=` param: teaser shows `sections/teaser` content, in FR and ZH (toggle lang button).
- [ ] Front `index.html?invite=<valid-token>`: all 10 site sections show `sections/*` content (hero, story, programme wrapper text + real events list from `events` unaffected, infos incl. places list, hebergement incl. hotels list, rsvp wrapper text + working form, gift, dress incl. avoid-colors, gallery, contact) in both languages.
- [ ] Admin → Sections: edit each of the 11 sections' scalar fields, save, confirm front reflects the change on reload.
- [ ] Admin → Sections: add/remove a list item in Infos/Hébergement/Dress-code, save, confirm front reflects it.
- [ ] Admin → Sections: toggle visible off on one non-critical section (e.g. `gallery`), confirm it disappears from the front; toggle back on.
- [ ] Admin → Blocs: confirm single list (no subtabs), add a freeform block, confirm it appears on `#blocks-section` on the invite site.
- [ ] Browser console: no errors on either `index.html` or `admin/index.html` throughout.

- [ ] **Step 4: Bump cache-busting version query params**

Given `nginx.conf` caches `.js`/`.css` for 1 year keyed by the `?v=N` query string, bump the version on every script tag that changed in this plan:
- `index.html`: `<script type="module" src="script.js?v=5"></script>` → bump `v` (e.g. `v=6`)
- `admin/index.html`: `<script type="module" src="script.js?v=2"></script>` → bump `v` (e.g. `v=3`); `<link rel="stylesheet" href="styles.css?v=3">` → bump `v` (e.g. `v=4`)

- [ ] **Step 5: Commit the version bumps**

```bash
git add index.html admin/index.html
git commit -m "chore: bump cache-busting versions for structured sections release"
```
