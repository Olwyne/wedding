# Final Review Fix Report

Branch: wysiwyg-block-text (worktree: /Users/sob/Projets/wedding/.claude/worktrees/wysiwyg-block-text)

## Important 1: Double-escaping on re-save for single-line content

File: `admin/richtext.js` (`mountRichEditor`, `getHtml`)

Changed the returned `getHtml` to wrap tagless non-empty innerHTML in `<p>...</p>` so the legacy-detection heuristic (`value.includes('<')`) can never misfire on freshly saved single-line content:

```js
return {
  getHtml: () => {
    const html = contentEl.innerHTML;
    return html.trim() === '' || /<[a-z]/i.test(html) ? html : `<p>${html}</p>`;
  },
};
```

Verification: served the repo over `python3 -m http.server` and loaded a small module-import test page in the Browser pane that:
1. mounted a fresh editor, typed "Sophie & Ruiyuan" (no Enter) via `document.execCommand('insertText', ...)`, called `getHtml()`.
2. fed that result into a second `mountRichEditor` call and called `getHtml()` again.

Output:
```
getHtml after typing: "<p>Sophie &amp; Ruiyuan</p>"
getHtml round-trip: "<p>Sophie &amp; Ruiyuan</p>"
round-trip match: true
```
Confirms no double-escaping on round trip.

## Important 2: Public site trusts unmigrated legacy values as raw HTML

File: `script.js`

Added `import { sanitizeHtml } from './admin/richtext.js';` (line 4, alongside existing imports).

Wrapped all 13 `rich-text` render sites (including `ev.desc` in `buildProgrammeBlock`) with `sanitizeHtml(...)`:
- script.js:351 `buildBlockItem` — content
- script.js:391 `buildTeaserBlock` — message
- script.js:494-495 `buildStoryBlock` — p1, p2
- script.js:510 `buildProgrammeBlock` — subtitle
- script.js:525 `buildProgrammeBlock` — ev.desc
- script.js:569 `buildHebergementBlock` — intro
- script.js:574 `buildHebergementBlock` — shuttle
- script.js:603 `buildRsvpBlock` — intro
- script.js:766 `buildGiftBlock` — text
- script.js:781 `buildDressBlock` — text
- script.js:805 `buildGalleryBlock` — hint
- script.js:832 `buildContactBlock` — text

Verification:
```
$ grep -n "rich-text" script.js
```
confirmed all 13 lines now call `sanitizeHtml(...)` around the interpolated value. `node --input-type=module --check < script.js` passed.

## Important 3: Public styles.css has no cache-busting version

File: `index.html` line 10

Changed `<link rel="stylesheet" href="styles.css">` to `<link rel="stylesheet" href="styles.css?v=1">`.

Verification: `grep -n "styles.css?v=1" index.html` — match found.

## Minor 4: Script/style tag content leaks as visible text

File: `admin/richtext.js`

Added `const DROP_ENTIRELY = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE', 'TEXTAREA']);` near `ALLOWED_TAGS`, and in `sanitizeNode`'s forEach callback, before the existing recursive/unwrap logic, added:
```js
if (DROP_ENTIRELY.has(node.tagName)) {
  parent.removeChild(node);
  return;
}
```

Verification (browser console test): `sanitizeHtml('<script>alert(1)</script><p>ok</p>')` returned `"<p>ok</p>"` — script content fully dropped, not left as text.

## Minor 5: Legacy `<` heuristic — clarifying comment

File: `admin/richtext.js`, above `const startHtml = value.includes('<') ? value : htmlFromLegacyText(value);`

Added:
```js
// Legacy plain text containing a literal '<' followed by a letter (rare) is misdetected as HTML; acceptable tradeoff per spec.
```

## Minor 7: admin/richtext.js imported without a cache-bust version

Files: `admin/blocks.js` line 8, `admin/events.js` line 8

Changed `from './richtext.js';` to `from './richtext.js?v=1';` in both files.

Verification: `grep -n "richtext.js?v=1" admin/blocks.js admin/events.js` — both matched.

## Minor 8: Silent data loss if an editor handle is missing

File: `admin/blocks.js`, `saveBlock` function, textarea branch

Replaced the silent `|| ''` fallback with a loop that throws if the rich editor handle is missing:
```js
} else if (f.kind === 'textarea') {
  ['fr', 'zh'].forEach(lang => {
    const editor = panelEl.richEditors?.[`${f.key}_${lang}`];
    if (!editor) throw new Error(`missing rich editor for ${f.key}_${lang}`);
    data[`${f.key}_${lang}`] = sanitizeHtml(editor.getHtml());
  });
} else {
```
The `url` branch and the final generic-text `else` branch were left unchanged.

Verification: read back the function — matches the spec structure exactly. `node --input-type=module --check < admin/blocks.js` passed.

## Syntax checks (all passed)

```
node --input-type=module --check < admin/richtext.js  -> OK
node --input-type=module --check < admin/blocks.js    -> OK
node --input-type=module --check < admin/events.js    -> OK
node --input-type=module --check < script.js          -> OK
```

## Files changed

- admin/richtext.js
- admin/blocks.js
- admin/events.js
- script.js
- index.html

## Concerns

None. Minor 6 and Minor 9 were intentionally left unaddressed per instructions (Minor 6 resolves itself via Important 1; Minor 9 is intentional design asymmetry between blocks.js and events.js).
