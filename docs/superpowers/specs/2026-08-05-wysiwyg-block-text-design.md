# WYSIWYG editor for block/event paragraph fields

Date: 2026-08-05

## Problem

Every `textarea` field in the back-office (block "paragraph" text: story p1/p2,
text content, teaser message, programme subtitle, hebergement intro/shuttle,
rsvp intro, gift/dress/gallery/contact text, plus the two event description
fields) is plain text today. There is no way to bold a word, break text into
multiple paragraphs that render as separate `<p>`, or make a list. The user
wants a WYSIWYG (rich text) editor on all of these fields, with basic
formatting, and it needs to actually render correctly on the public site.

## Scope

Fields affected (all currently `kind: 'textarea'` in
[admin/blocks.js](../../../admin/blocks.js) `TYPE_DEFS`, each with an
`_fr`/`_zh` pair, plus the two fields below in
[admin/events.js](../../../admin/events.js)):

- `text.content`, `teaser.message`, `story.p1`, `story.p2`,
  `programme.subtitle`, `hebergement.intro`, `hebergement.shuttle`,
  `rsvp.intro`, `gift.text`, `dress.text`, `gallery.hint`, `contact.text`
- `events`: `desc` (`ev-desc-fr` / `ev-desc-zh`)

Single-line text fields (`kicker`, `title`, `name`, etc., `kind: 'text'`/`'url'`)
are unaffected — user asked specifically for "textarea" / paragraph fields.

## Formatting level

Basic: bold, italic, paragraphs (line breaks), bullet list. No links, no
headings, no colors, no alignment (kept out to limit XSS surface and
implementation size — nothing in the wedding site's copy needs them).

## Data model change

These fields switch from storing plain text to storing a sanitized HTML
fragment (string), e.g. `<p>Some <b>text</b>.</p><ul><li>item</li></ul>`.
Same Firestore field key, same `_fr`/`_zh` suffix convention. No Firestore
migration script — see "Legacy content" below.

## Approach: home-made contenteditable component

New file `admin/richtext.js`, no external dependency (matches the project's
existing all-vanilla-JS, no-bundler style; the only external import anywhere
today is the Firebase SDK from a CDN, not a pattern to extend for UI chrome).

Exports:

- `mountRichEditor(container, initialValue) -> { getHtml(): string }`
  - Renders a small toolbar (Gras / Italique / Liste) inside `container`,
    followed by a `contenteditable="true"` div styled to match the existing
    `.field textarea` look (border, padding, min-height, focus ring).
  - Toolbar buttons call `document.execCommand('bold' | 'italic' |
    'insertUnorderedList')` on the current selection. `execCommand` is
    deprecated but still implemented by every browser for exactly this
    contenteditable-toolbar use case, and there's no build step here to
    justify hand-rolling a Selection/Range-based replacement.
  - **Legacy content**: if `initialValue` contains no `<` character, it is
    treated as pre-existing plain text and auto-converted on mount: split on
    blank lines into paragraphs, each wrapped in `<p>`, single `\n` inside a
    paragraph becomes `<br>`. If it already contains a `<`, it's assumed to
    already be sanitized HTML from a previous save and is set directly via
    `innerHTML`. This means opening an old block and hitting Save is enough
    to migrate it — no batch migration job needed.
  - `getHtml()` returns `container.querySelector('[contenteditable]').innerHTML`.

- `sanitizeHtml(html) -> string` — whitelist sanitizer, used on every save
  (both from the rich editor and, defensively, even if a value somehow
  arrives pre-formed). Parses the string into a detached `<template>` element,
  walks the resulting node tree, and:
  - Drops any element whose tag is not in `{p, br, b, strong, i, em, ul, li}`
    (no `a` — no link support in this pass, see Formatting level above),
    replacing it with its own children (so text isn't lost, just unwrapped).
  - Strips every attribute on every surviving element (no `style`, `class`,
    `on*` handlers, etc. survive).
  - Runs even on input that only ever came from our own toolbar, because
    pasting from Word/Google Docs/a webpage into a contenteditable brings
    arbitrary markup and inline styles along with it.

## admin/blocks.js integration

- `buildScalarFieldHtml`: when `field.kind === 'textarea'`, render a mount
  point (`<div class="rich-editor-mount" data-field="...">`) for each of
  `_fr`/`_zh` instead of a `<textarea>`.
- `openBlockPanel` (and the "new block, type selected" path): after the form
  HTML is inserted, call `mountRichEditor` on each mount point, next to the
  existing `attachListHandlers` call. Keep references to the returned
  `{ getHtml }` handles (e.g. on a `Map` keyed by field id) for `saveBlock` to
  read from.
- `saveBlock`: for `kind === 'textarea'` fields, read `sanitizeHtml(handle.getHtml())`
  instead of `panelEl.querySelector(...).value`.

## admin/events.js integration

Same pattern for the two `desc` fields: mount point instead of `<textarea
id="ev-desc-fr">`, read + sanitize on save.

## Public site rendering (script.js)

Every place that does `<p class="...">${escapeHtml(bf(block, 'field', lang))}</p>`
for one of the fields in Scope must change in two ways:

1. Stop escaping — the value is now already-sanitized, trusted HTML at write
   time, not raw text to escape at read time: `${bf(block, 'field', lang)}`.
2. Change the wrapping element from `<p>` to `<div>` (keeping the same CSS
   class) — the stored value can itself contain multiple `<p>` or a `<ul>`,
   and nesting block elements inside a `<p>` is invalid HTML that browsers
   will silently un-nest in surprising ways.

Concretely, this touches: `buildBlockItem` (line ~350, `text.content`),
`buildTeaserBlock` (line ~390, `message`), `buildStoryBlock` (lines ~493-494,
`p1`/`p2`), `buildProgrammeBlock` (line ~509, `subtitle`),
`buildHebergementBlock` (lines ~568, ~573, `intro`/`shuttle`),
`buildRsvpBlock` (line ~602, `intro`), `buildGiftBlock` (line ~765),
`buildDressBlock` (line ~780), `buildGalleryBlock` (line ~804, `hint`),
`buildContactBlock` (line ~831), and `buildProgrammeBlock` (line ~524,
`<p class="prog-desc">${ev.desc}</p>`) for the event `desc` field — same
`<p>`→`<div>` swap, same reason. `ev.desc` already renders unescaped today
(pre-existing, unrelated gap — see Out of scope), so this field only needs
the wrapper fix, not an escaping fix.

All other fields on the same blocks (`kicker`, `title`, etc.) stay on
`escapeHtml`, unchanged — they're not in Scope.

## Error handling

Nothing new: sanitization is a pure function with no failure mode (worst case
it strips everything to empty). `saveBlock`'s existing try/catch (and the
error-surfacing added in the previous fix) already covers the Firestore write
itself.

## Testing

No test framework exists in this project (static admin pages + Firebase, no
CI). Verification is manual in the browser preview:

1. Open a block with a paragraph field (e.g. "Histoire"), confirm legacy
   plain text renders as one paragraph in the new editor.
2. Type multi-paragraph text, bold a word, add a bullet list; save; reopen —
   confirm formatting round-trips.
3. Paste rich text copied from a webpage (with inline styles/classes); save;
   inspect the stored value only has whitelisted tags, no attributes.
4. Load the public site, confirm the block renders paragraphs/bold/list
   correctly and `view-source` shows a `<div>` (not nested `<p>`) wrapper.

## Out of scope

- Link insertion, headings, colors, alignment (see Formatting level).
- Batch-migrating existing plain-text field values in Firestore — handled
  lazily on next edit+save instead.
- A pre-existing gap noticed while reading `script.js`: `buildProgrammeBlock`
  interpolates `ev.title`, `ev.place`, `ev.zh`, `ev.time` (all single-line
  event fields) into `innerHTML` **without** `escapeHtml`, unlike every other
  field in the file. That's a latent stored-injection risk limited to
  whatever an admin with `events` write access types in, unrelated to this
  WYSIWYG work (those are `kind: 'text'` single-line fields, not in Scope).
  Left untouched here; worth its own follow-up.
