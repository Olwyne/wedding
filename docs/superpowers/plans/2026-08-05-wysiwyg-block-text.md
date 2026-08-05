# WYSIWYG editor for block/event paragraph fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace plain `<textarea>` fields for block/event paragraph text with a basic (bold/italic/list) home-made WYSIWYG editor, storing sanitized HTML and rendering it correctly on the public site.

**Architecture:** One new dependency-free module (`admin/richtext.js`) exposes a `contenteditable`-based editor component and an HTML whitelist sanitizer. `admin/blocks.js` and `admin/events.js` mount it in place of textareas and sanitize on save. `script.js` (public site) stops escaping these specific fields and swaps their wrapper tag from `<p>` to `<div>` since the value can now contain block-level markup.

**Tech Stack:** Vanilla ES modules, no build step, no external libraries. `document.execCommand` for toolbar actions (still implemented by all browsers for this exact use case). Firebase Firestore for storage (unchanged).

## Global Constraints

- No external dependency / CDN library for the editor (spec: "Approach: home-made contenteditable component").
- Formatting limited to bold, italic, paragraphs, bullet list — no links, headings, colors, alignment (spec: "Formatting level").
- No Firestore migration script; legacy plain-text values convert to HTML lazily when the field is opened and saved again (spec: "Legacy content").
- Sanitize on every save, including values that only ever came from the toolbar (spec: paste from Word/Docs carries arbitrary markup).
- Every field touched is one of exactly these 14: `blocks` → `text.content`, `teaser.message`, `story.p1`, `story.p2`, `programme.subtitle`, `hebergement.intro`, `hebergement.shuttle`, `rsvp.intro`, `gift.text`, `dress.text`, `gallery.hint`, `contact.text`; `events` → `desc`. Single-line fields (`kicker`, `title`, etc.) are untouched.
- Cache-busting: this project appends `?v=N` to its own ES module imports and bumps N on every change to that module (see `admin/script.js`, recent commit `9dad080`). Every modified module gets its import site's version bumped.

---

## File Structure

- **Create** `admin/richtext.js` — `mountRichEditor(container, initialValue)` and `sanitizeHtml(html)`. Single responsibility: the editor component and its output sanitizer, no knowledge of blocks/events.
- **Modify** `admin/blocks.js` — mount/read the editor for `kind: 'textarea'` fields instead of a raw `<textarea>`.
- **Modify** `admin/events.js` — same, for the two `desc` fields.
- **Modify** `admin/styles.css` — visual styling for the editor's toolbar and content area, matching the existing `.field textarea` look.
- **Modify** `admin/index.html` — bump `styles.css` cache-bust version.
- **Modify** `admin/script.js` — bump `blocks.js` and `events.js` cache-bust versions.
- **Modify** `script.js` (public site) — 11 render call sites: stop escaping, swap `<p>`→`<div>`, add a shared `.rich-text` class for paragraph/list spacing.
- **Modify** `styles.css` (public site) — add the `.rich-text` spacing rule; bump its own script.js cache-bust version in `index.html`.

---

### Task 1: `richtext.js` — sanitizer

**Files:**
- Create: `admin/richtext.js`

**Interfaces:**
- Produces: `export function sanitizeHtml(html: string): string` — used by Task 3 and Task 4.

- [ ] **Step 1: Create the file with the sanitizer**

```javascript
// admin/richtext.js
const ALLOWED_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'UL', 'LI']);

function sanitizeNode(parent) {
  Array.from(parent.childNodes).forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      sanitizeNode(node);
      if (ALLOWED_TAGS.has(node.tagName)) {
        Array.from(node.attributes).forEach(attr => node.removeAttribute(attr.name));
      } else {
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        parent.removeChild(node);
      }
    } else if (node.nodeType !== Node.TEXT_NODE) {
      parent.removeChild(node);
    }
  });
}

export function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = typeof html === 'string' ? html : '';
  sanitizeNode(template.content);
  return template.innerHTML;
}
```

- [ ] **Step 2: Verify manually in the browser console**

Start the dev server and open a tab (use the Browser pane's `preview_start` with `{name: "wedding"}`, then `navigate` to `http://localhost:8090/admin/`). Open the JS console via `javascript_tool` and run:

```javascript
const { sanitizeHtml } = await import('/admin/richtext.js');
JSON.stringify([
  sanitizeHtml('<p>hi <script>alert(1)</script></p>'),
  sanitizeHtml('<div style="color:red" onclick="x()"><b class="y">bold</b></div>'),
  sanitizeHtml('<p>a</p><ul><li>one</li><li>two</li></ul>'),
  sanitizeHtml(null),
])
```

Expected result (in this order):
- `"<p>hi alert(1)</p>"` — the `<script>` tag is unwrapped (its text content survives as plain text, not executed — it was never executed since `template.innerHTML` doesn't run scripts, and the tag itself is stripped by the sanitizer)
- `"<b>bold</b>"` — the `<div>` (not allowed) is unwrapped, `style`/`onclick`/`class` attributes are stripped
- `"<p>a</p><ul><li>one</li><li>two</li></ul>"` — unchanged, all tags allowed
- `""` — non-string input returns empty string

- [ ] **Step 3: Commit**

```bash
git add admin/richtext.js
git commit -m "feat: add HTML whitelist sanitizer for rich text fields"
```

---

### Task 2: `richtext.js` — editor component

**Files:**
- Modify: `admin/richtext.js`

**Interfaces:**
- Consumes: nothing from Task 1 directly (sanitization happens at save time in Tasks 3/4, not inside the editor).
- Produces: `export function mountRichEditor(container: HTMLElement, initialValue: string): { getHtml(): string }` — used by Task 3 and Task 4.

- [ ] **Step 1: Add legacy-text conversion and the editor to `admin/richtext.js`**

Append to the file:

```javascript
function escapeText(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function htmlFromLegacyText(text) {
  const blocks = text.split(/\n{2,}/).filter(b => b.trim() !== '');
  if (blocks.length === 0) return '';
  return blocks
    .map(block => `<p>${block.split('\n').map(escapeText).join('<br>')}</p>`)
    .join('');
}

const TOOLBAR_BUTTONS = [
  { cmd: 'bold', label: 'G', title: 'Gras' },
  { cmd: 'italic', label: 'I', title: 'Italique' },
  { cmd: 'insertUnorderedList', label: '•', title: 'Liste' },
];

export function mountRichEditor(container, initialValue) {
  const value = typeof initialValue === 'string' ? initialValue : '';
  const startHtml = value.includes('<') ? value : htmlFromLegacyText(value);

  container.innerHTML = `
    <div class="rich-editor-toolbar">
      ${TOOLBAR_BUTTONS.map(b =>
        `<button type="button" class="rich-editor-btn" data-cmd="${b.cmd}" title="${b.title}">${b.label}</button>`
      ).join('')}
    </div>
    <div class="rich-editor-content" contenteditable="true">${startHtml}</div>`;

  const contentEl = container.querySelector('.rich-editor-content');
  container.querySelectorAll('.rich-editor-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      contentEl.focus();
      document.execCommand(btn.dataset.cmd);
    });
  });

  return { getHtml: () => contentEl.innerHTML };
}
```

- [ ] **Step 2: Verify manually in the browser console**

With the dev server still running (Task 1's tab), run in the console:

```javascript
const { mountRichEditor } = await import('/admin/richtext.js');
const host = document.createElement('div');
document.body.appendChild(host);

const ed1 = mountRichEditor(host, 'Ligne un\nLigne deux\n\nDeuxième paragraphe');
JSON.stringify(ed1.getHtml())
```

Expected: `"<p>Ligne un<br>Ligne deux</p><p>Deuxième paragraphe</p>"`

Then, in the same console session, test the already-HTML path:

```javascript
const host2 = document.createElement('div');
document.body.appendChild(host2);
const ed2 = mountRichEditor(host2, '<p>already <b>rich</b></p>');
JSON.stringify(ed2.getHtml())
```

Expected: `"<p>already <b>rich</b></p>"` (passed through untouched, not re-wrapped).

Then visually confirm the toolbar: use `computer` (screenshot) on `host` — three buttons ("G", "I", "•") should appear above a bordered content area containing "Ligne un / Ligne deux" then "Deuxième paragraphe" as two visually separate lines/paragraphs. Click into the content area, select the word "rich" in `host2`'s content (it's already bold from the stored `<b>`), click the "G" button, and confirm (via `getHtml()` again) that the bold is removed — proving the toolbar actually toggles formatting on the live selection.

Clean up: `host.remove(); host2.remove();`

- [ ] **Step 3: Commit**

```bash
git add admin/richtext.js
git commit -m "feat: add contenteditable rich text editor component"
```

---

### Task 3: styling

**Files:**
- Modify: `admin/styles.css`
- Modify: `admin/index.html:7`

**Interfaces:**
- Consumes: the `.rich-editor-toolbar`, `.rich-editor-btn`, `.rich-editor-content` class names produced by Task 2's `mountRichEditor`.

- [ ] **Step 1: Add editor styles to `admin/styles.css`**

Insert after the existing `.field textarea{resize:vertical;min-height:80px}` line (currently line 37):

```css
.rich-editor-toolbar{display:flex;gap:4px;margin-bottom:6px}
.rich-editor-btn{background:#fff;border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-size:13px;font-weight:600;color:var(--text)}
.rich-editor-btn:hover{background:#f9fafb;border-color:#d1d5db}
.rich-editor-content{padding:8px 11px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:inherit;color:var(--text);min-height:80px;transition:border-color .15s,box-shadow .15s}
.rich-editor-content:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(110,26,26,.1)}
.rich-editor-content p{margin-bottom:8px}
.rich-editor-content p:last-child{margin-bottom:0}
.rich-editor-content ul{margin:0 0 8px 20px}
.rich-editor-content ul:last-child{margin-bottom:0}
```

- [ ] **Step 2: Bump the cache-bust version**

In `admin/index.html:7`, change:

```html
<link rel="stylesheet" href="styles.css?v=9">
```

to:

```html
<link rel="stylesheet" href="styles.css?v=10">
```

- [ ] **Step 3: Verify visually**

Reload the admin tab from Task 2 (`navigate` to the same URL again). Since Task 4/5 haven't wired the editor into any real panel yet, verify by re-running the Task 2 console snippet (`mountRichEditor(host, ...)`) and screenshotting `host`: buttons should now look like small bordered pill buttons, and the content area should have a visible border with the same rounded corners as other form fields, turning maroon (`var(--accent)`) with a soft shadow when clicked into.

- [ ] **Step 4: Commit**

```bash
git add admin/styles.css admin/index.html
git commit -m "style: add rich text editor styling"
```

---

### Task 4: integrate into `admin/blocks.js`

**Files:**
- Modify: `admin/blocks.js:1-8` (imports)
- Modify: `admin/blocks.js:247-270` (`buildScalarFieldHtml`)
- Modify: `admin/blocks.js:358-424` (`openBlockPanel`)
- Modify: `admin/blocks.js:426-457` (`saveBlock`)
- Modify: `admin/script.js:4`

**Interfaces:**
- Consumes: `sanitizeHtml`, `mountRichEditor` from `admin/richtext.js` (Tasks 1-2).

- [ ] **Step 1: Import the new module**

In `admin/blocks.js`, change line 7 from:

```javascript
import { canWrite } from './permissions.js';
```

to:

```javascript
import { canWrite } from './permissions.js';
import { sanitizeHtml, mountRichEditor } from './richtext.js';
```

- [ ] **Step 2: Split the textarea case out of `buildScalarFieldHtml`**

Replace the whole function (`admin/blocks.js:247-270`):

```javascript
function buildScalarFieldHtml(field, data) {
  if (field.kind === 'url') {
    const v = escapeHtml(data?.[field.key] || '');
    return `
      <label class="field">
        <span>${escapeHtml(field.label)}</span>
        <input id="blk-${field.key}" value="${v}" placeholder="https://…">
      </label>`;
  }
  if (field.kind === 'textarea') {
    return `
      <label class="field">
        <span>${escapeHtml(field.label)} FR</span>
        <div class="rich-editor-mount" id="blk-${field.key}-fr-mount"></div>
      </label>
      <label class="field">
        <span>${escapeHtml(field.label)} ZH</span>
        <div class="rich-editor-mount" id="blk-${field.key}-zh-mount"></div>
      </label>`;
  }
  const vFr = escapeHtml(data?.[`${field.key}_fr`] || '');
  const vZh = escapeHtml(data?.[`${field.key}_zh`] || '');
  return `
    <label class="field">
      <span>${escapeHtml(field.label)} FR</span>
      <input id="blk-${field.key}-fr" value="${vFr}">
    </label>
    <label class="field">
      <span>${escapeHtml(field.label)} ZH</span>
      <input id="blk-${field.key}-zh" value="${vZh}">
    </label>`;
}
```

Note: the old generic branch handled both `text` and `textarea` kinds via a shared `tag`/`attrs` variable. Since `textarea` now renders mount `<div>`s instead of a form control, the remaining generic branch only ever runs for `kind: 'text'` (the default), so it's simplified to always use `<input>`.

- [ ] **Step 3: Add a helper that mounts editors for a block type, and call it everywhere a form is rendered**

Add this new function right after `renderBlockForm` (after line 346, before `attachImagePreview`):

```javascript
function mountRichEditorsForType(panelEl, def, data) {
  panelEl.richEditors = {};
  def.fields.filter(f => f.kind === 'textarea').forEach(f => {
    ['fr', 'zh'].forEach(lang => {
      const mount = panelEl.querySelector(`#blk-${f.key}-${lang}-mount`);
      const value = data?.[`${f.key}_${lang}`] || '';
      panelEl.richEditors[`${f.key}_${lang}`] = mountRichEditor(mount, value);
    });
  });
}
```

Then in `openBlockPanel`, in the "new block, type selected" handler (around line 393-401), change:

```javascript
      card.addEventListener('click', () => {
        panelEl.querySelectorAll('.type-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        panelEl.querySelector('#panel-body').innerHTML =
          renderBlockForm({ type: card.dataset.type, visible: true });
        panelEl.querySelector('#panel-save').disabled = false;
        attachListHandlers(panelEl, TYPE_DEFS[card.dataset.type]);
      });
```

to:

```javascript
      card.addEventListener('click', () => {
        panelEl.querySelectorAll('.type-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        panelEl.querySelector('#panel-body').innerHTML =
          renderBlockForm({ type: card.dataset.type, visible: true });
        panelEl.querySelector('#panel-save').disabled = false;
        attachListHandlers(panelEl, TYPE_DEFS[card.dataset.type]);
        mountRichEditorsForType(panelEl, TYPE_DEFS[card.dataset.type], { visible: true });
      });
```

and in the `else` branch right below it (existing block being edited, around line 402-405), change:

```javascript
  } else {
    attachImagePreview(panelEl, block?.image_url);
    attachListHandlers(panelEl, TYPE_DEFS[block.type]);
  }
```

to:

```javascript
  } else {
    attachImagePreview(panelEl, block?.image_url);
    attachListHandlers(panelEl, TYPE_DEFS[block.type]);
    mountRichEditorsForType(panelEl, TYPE_DEFS[block.type], block);
  }
```

- [ ] **Step 4: Read from the editors (sanitized) on save**

In `saveBlock` (`admin/blocks.js:439-446`), change:

```javascript
  def.fields.forEach(f => {
    if (f.kind === 'url') {
      data[f.key] = panelEl.querySelector(`#blk-${f.key}`)?.value || '';
    } else {
      data[`${f.key}_fr`] = panelEl.querySelector(`#blk-${f.key}-fr`)?.value || '';
      data[`${f.key}_zh`] = panelEl.querySelector(`#blk-${f.key}-zh`)?.value || '';
    }
  });
```

to:

```javascript
  def.fields.forEach(f => {
    if (f.kind === 'url') {
      data[f.key] = panelEl.querySelector(`#blk-${f.key}`)?.value || '';
    } else if (f.kind === 'textarea') {
      data[`${f.key}_fr`] = sanitizeHtml(panelEl.richEditors?.[`${f.key}_fr`]?.getHtml() || '');
      data[`${f.key}_zh`] = sanitizeHtml(panelEl.richEditors?.[`${f.key}_zh`]?.getHtml() || '');
    } else {
      data[`${f.key}_fr`] = panelEl.querySelector(`#blk-${f.key}-fr`)?.value || '';
      data[`${f.key}_zh`] = panelEl.querySelector(`#blk-${f.key}-zh`)?.value || '';
    }
  });
```

- [ ] **Step 5: Bump the cache-bust version**

In `admin/script.js:4`, change:

```javascript
import { renderBlocksTab } from './blocks.js?v=5';
```

to:

```javascript
import { renderBlocksTab } from './blocks.js?v=6';
```

- [ ] **Step 6: Verify manually**

Reload the admin tab, log in (an account with `blocks: write` permission is required — use the existing admin account), go to "Blocs", open the "Histoire" block (type `story`, has `p1`/`p2` textarea fields). Confirm:
1. `p1`/`p2` now show the toolbar + bordered content area instead of `<textarea>`, pre-filled with the existing text (legacy text, so it should appear as a single paragraph — or one paragraph per existing blank-line-separated section if any).
2. Type a second paragraph (press Enter twice), bold a word, click "Enregistrer".
3. Re-open the same block — confirm both paragraphs and the bold word are still there (round-trip through Firestore).
4. Use `read_network_requests` or the Firestore console (if accessible) — not required if step 3 already proves the round-trip; step 3 is the authoritative check.

- [ ] **Step 7: Commit**

```bash
git add admin/blocks.js admin/script.js
git commit -m "feat: use rich text editor for block textarea fields"
```

---

### Task 5: integrate into `admin/events.js`

**Files:**
- Modify: `admin/events.js:1-7` (imports)
- Modify: `admin/events.js:101-102` (form markup)
- Modify: `admin/events.js:109-137` (mount + save)
- Modify: `admin/script.js:6`

**Interfaces:**
- Consumes: `sanitizeHtml`, `mountRichEditor` from `admin/richtext.js` (Tasks 1-2).

- [ ] **Step 1: Import the new module**

In `admin/events.js`, change line 7 from:

```javascript
import { canWrite } from './permissions.js';
```

to:

```javascript
import { canWrite } from './permissions.js';
import { sanitizeHtml, mountRichEditor } from './richtext.js';
```

- [ ] **Step 2: Replace the two textareas with mount points**

In `openEventPanel` (`admin/events.js:101-102`), change:

```javascript
      <label class="field"><span>Description FR</span><textarea id="ev-desc-fr" rows="3">${v('desc_fr')}</textarea></label>
      <label class="field"><span>Description ZH</span><textarea id="ev-desc-zh" rows="3">${v('desc_zh')}</textarea></label>
```

to:

```javascript
      <label class="field"><span>Description FR</span><div class="rich-editor-mount" id="ev-desc-fr-mount"></div></label>
      <label class="field"><span>Description ZH</span><div class="rich-editor-mount" id="ev-desc-zh-mount"></div></label>
```

Note: `v('desc_fr')` (line 79's `escapeHtml`-wrapping helper) is no longer used for these two fields — it stays as-is for every other field in the panel, which are still plain `<input>`s.

- [ ] **Step 3: Mount the editors after the panel is in the DOM**

In `admin/events.js`, right after `document.body.appendChild(panelEl);` (line 110), add:

```javascript
  const descFrEditor = mountRichEditor(panelEl.querySelector('#ev-desc-fr-mount'), ev?.desc_fr || '');
  const descZhEditor = mountRichEditor(panelEl.querySelector('#ev-desc-zh-mount'), ev?.desc_zh || '');
```

- [ ] **Step 4: Read sanitized HTML on save**

In the save handler (`admin/events.js:117-130`), change:

```javascript
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
```

to:

```javascript
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
      desc_fr: sanitizeHtml(descFrEditor.getHtml()),
      desc_zh: sanitizeHtml(descZhEditor.getHtml()),
    };
```

- [ ] **Step 5: Bump the cache-bust version**

In `admin/script.js:6`, change:

```javascript
import { renderEventsTab } from './events.js?v=2';
```

to:

```javascript
import { renderEventsTab } from './events.js?v=3';
```

- [ ] **Step 6: Verify manually**

Reload the admin tab, go to "Événements", open an existing event. Confirm the description fields show the rich editor pre-filled with existing text, edit + bold a word + save, re-open to confirm round-trip (same check as Task 4 Step 6).

- [ ] **Step 7: Commit**

```bash
git add admin/events.js admin/script.js
git commit -m "feat: use rich text editor for event description fields"
```

---

### Task 6: public site rendering

**Files:**
- Modify: `script.js:339-834` (10 block builder functions, 11 interpolation sites)
- Modify: `styles.css:1-300` (add `.rich-text` rule)
- Modify: `index.html:82`

**Interfaces:**
- Consumes: the sanitized HTML strings now stored by Tasks 4/5 in place of plain text, for the 13 block fields + 1 event field listed in Global Constraints.

- [ ] **Step 1: `buildBlockItem` — `text.content`**

In `script.js:346-350`, change:

```javascript
    if (block.type === 'text') {
      const content = lang === 'zh'
        ? (block.content_zh || block.content_fr || '')
        : (block.content_fr || block.content_zh || '');
      item.innerHTML = `${titleHtml}${content ? `<p class="block-content">${escapeHtml(content)}</p>` : ''}`;
```

to:

```javascript
    if (block.type === 'text') {
      const content = lang === 'zh'
        ? (block.content_zh || block.content_fr || '')
        : (block.content_fr || block.content_zh || '');
      item.innerHTML = `${titleHtml}${content ? `<div class="block-content rich-text">${content}</div>` : ''}`;
```

- [ ] **Step 2: `buildTeaserBlock` — `teaser.message`**

In `script.js:390`, change:

```javascript
      <p class="teaser-msg">${escapeHtml(bf(block, 'message', lang))}</p>
```

to:

```javascript
      <div class="teaser-msg rich-text">${bf(block, 'message', lang)}</div>
```

- [ ] **Step 3: `buildStoryBlock` — `story.p1`, `story.p2`**

In `script.js:493-494`, change:

```javascript
        <p class="section-text">${escapeHtml(bf(block, 'p1', lang))}</p>
        <p class="section-text">${escapeHtml(bf(block, 'p2', lang))}</p>
```

to:

```javascript
        <div class="section-text rich-text">${bf(block, 'p1', lang)}</div>
        <div class="section-text rich-text">${bf(block, 'p2', lang)}</div>
```

- [ ] **Step 4: `buildProgrammeBlock` — `programme.subtitle` and event `desc`**

In `script.js:509`, change:

```javascript
        <p class="section-sub">${escapeHtml(bf(block, 'subtitle', lang))}</p>
```

to:

```javascript
        <div class="section-sub rich-text">${bf(block, 'subtitle', lang)}</div>
```

In `script.js:524`, change:

```javascript
          <p class="prog-desc">${ev.desc}</p>
```

to:

```javascript
          <div class="prog-desc rich-text">${ev.desc}</div>
```

(`ev.desc` was already unescaped before this change — see the spec's "Out of scope" note on the separate `escapeHtml` gap for `ev.title`/`ev.place`/`ev.zh`/`ev.time`, which this task does not touch.)

- [ ] **Step 5: `buildHebergementBlock` — `hebergement.intro`, `hebergement.shuttle`**

In `script.js:568`, change:

```javascript
        <p class="section-text-narrow">${escapeHtml(bf(block, 'intro', lang))}</p>
```

to:

```javascript
        <div class="section-text-narrow rich-text">${bf(block, 'intro', lang)}</div>
```

In `script.js:573`, change:

```javascript
        <p>${escapeHtml(bf(block, 'shuttle', lang))}</p>
```

to:

```javascript
        <div class="rich-text">${bf(block, 'shuttle', lang)}</div>
```

- [ ] **Step 6: `buildRsvpBlock` — `rsvp.intro`**

In `script.js:602`, change:

```javascript
          <p class="section-sub">${escapeHtml(bf(block, 'intro', lang))}</p>
```

to:

```javascript
          <div class="section-sub rich-text">${bf(block, 'intro', lang)}</div>
```

- [ ] **Step 7: `buildGiftBlock`, `buildDressBlock`, `buildGalleryBlock`, `buildContactBlock`**

In `script.js:765`, change:

```javascript
<p class="card-text">${escapeHtml(bf(block, 'text', lang))}</p>
```

to:

```javascript
<div class="card-text rich-text">${bf(block, 'text', lang)}</div>
```

In `script.js:780`, change:

```javascript
<p class="card-text card-text-light">${escapeHtml(bf(block, 'text', lang))}</p>
```

to:

```javascript
<div class="card-text card-text-light rich-text">${bf(block, 'text', lang)}</div>
```

In `script.js:804`, change:

```javascript
<p class="section-text-narrow">${escapeHtml(bf(block, 'hint', lang))}</p>
```

to:

```javascript
<div class="section-text-narrow rich-text">${bf(block, 'hint', lang)}</div>
```

In `script.js:831`, change:

```javascript
<p class="footer-text">${escapeHtml(bf(block, 'text', lang))}</p>
```

to:

```javascript
<div class="footer-text rich-text">${bf(block, 'text', lang)}</div>
```

- [ ] **Step 8: Add the `.rich-text` spacing rule**

The global reset (`styles.css:25`, `*{box-sizing:border-box;margin:0;padding:0}`) zeroes out the browser's default `<p>` margin, so multiple `<p>`/`<ul>` produced by the editor would otherwise run together with no visual gap. Add, anywhere in `styles.css` near the other generic utility rules:

```css
.rich-text p{margin-bottom:.6em}
.rich-text p:last-child{margin-bottom:0}
.rich-text ul{margin:0 0 .6em 1.25em}
.rich-text ul:last-child{margin-bottom:0}
```

- [ ] **Step 9: Bump the cache-bust version**

In `index.html:82`, change:

```html
<script type="module" src="script.js?v=13"></script>
```

to:

```html
<script type="module" src="script.js?v=14"></script>
```

- [ ] **Step 10: Verify manually**

With the dev server running, navigate to `http://localhost:8090/` (the public site — use a guest invite link/token if the "Histoire" section requires the invite-only view; otherwise the public/teaser view is enough to check `teaser.message`). Confirm:
1. The paragraphs saved in Task 4 Step 6 (two paragraphs, one bolded word) render as two visually separated paragraphs with the bold word actually bold — not as literal `<p>`/`<b>` text and not run together.
2. `view-source:http://localhost:8090/` or `read_network_requests` on the page — inspect the rendered DOM (via `read_page` or `javascript_tool: document.querySelector('.section-text').outerHTML`) and confirm it's a `<div class="section-text rich-text">` (not a `<p>`), containing nested `<p>`/`<b>`.
3. Take a screenshot of the "Histoire" section for a final visual check.

- [ ] **Step 11: Commit**

```bash
git add script.js styles.css index.html
git commit -m "feat: render rich text block/event fields as HTML on public site"
```

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 4/5 write HTML), home-made component (Tasks 1-2), legacy conversion (Task 2), sanitization on every save (Tasks 4/5 call `sanitizeHtml` unconditionally), all 10 `script.js` render sites + the event `desc` site (Task 6), out-of-scope `ev.title`/`place`/`zh`/`time` gap explicitly left untouched (Task 6 Step 4 note) — all covered.
- **Placeholder scan:** none found — every step has complete before/after code.
- **Type consistency:** `mountRichEditor(container, initialValue) -> { getHtml(): string }` used identically in Tasks 2 (verification), 4, and 5. `sanitizeHtml(html) -> string` used identically in Tasks 1 (verification), 4, and 5. Field naming (`${key}_fr`/`${key}_zh`, `#blk-${key}-fr-mount`) consistent between Task 4 Steps 2-4.
