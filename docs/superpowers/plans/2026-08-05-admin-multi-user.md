# Multi-User Admin Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the wedding admin owner create additional back-office accounts (spouse, witnesses) with per-section read/write/none permissions, without any server backend.

**Architecture:** New Firestore collection `admins/{uid}` stores each account's `permissions` map (`{sectionId: 'none'|'read'|'write'}`), keyed by the section ids in a new central registry (`admin/sections-registry.js`). A new `admin/permissions.js` module loads the signed-in user's permissions on login and exposes `canRead`/`canWrite`. The sidebar and each section's write controls (add/edit/delete buttons) are gated on these. Account creation happens client-side via a throwaway secondary Firebase App instance (`admin/users.js`) so it doesn't sign out the admin creating the account. Each user can change their own password from a new "Mon compte" panel (`admin/account.js`). Firestore rules are rewritten to check `admins/{uid}.permissions` per collection, with a narrow self-bootstrap clause (scoped to the owner's email) so the very first `admins` doc can be created without a chicken-and-egg problem.

**Tech Stack:** Vanilla JS (ES modules), Firebase v10.7.1 modular SDK (Firestore + Auth), no build step, no test framework (static site — verification is manual, matches existing project convention).

## Global Constraints

- No automated test framework in this repo — every task's "test" step is manual browser verification, not an automated test run. Spec: `docs/superpowers/specs/2026-08-05-admin-multi-user-design.md`.
- Section ids used throughout (`blocks`, `guests`, `events`, `users`) must exactly match `admin/sections-registry.js` — this is the single source of truth per spec §3.1. Adding a future section means adding one entry there plus its own Firestore rule block, no other refactor.
- Permission levels are exactly the strings `'none'`, `'read'`, `'write'` — `'write'` implies read, there is no separate "read+write" combination. Spec §3.2.
- `firestore.rules` changes require `firebase deploy --only firestore:rules` to take effect — this plan treats the actual deploy as an action requiring the user's explicit go-ahead at execution time (production security change).
- The owner's account (sophbyr@gmail.com) must end up with `permissions: { blocks: 'write', guests: 'write', events: 'write', users: 'write' }` — this is what the self-bootstrap seed produces. Spec §7.
- Passwords for invited accounts are auto-generated (12 chars) and shown once for manual copy — no email automation. Spec §4.2, §8.

---

## File Structure

| File | Change |
|---|---|
| `admin/sections-registry.js` (new) | `SECTIONS` array — single source of truth for permissioned section ids/labels/collections |
| `admin/permissions.js` (new) | `loadPermissions(uid)`, `getPermission(id)`, `canRead(id)`, `canWrite(id)` |
| `firestore.rules` | Replace blanket `request.auth != null` checks with `perm()`-based rules per collection, add `admins` collection rule with self-bootstrap clause |
| `admin/seed-admin.html`, `admin/seed-admin.js` (new) | One-shot page to create the owner's full-access `admins/{uid}` doc |
| `admin/auth.js` | Await `loadPermissions(user.uid)` before signaling sign-in |
| `admin/index.html` | Add "Utilisateurs" nav item + `#tab-users` panel, hide permissioned nav items by default, add "Mon compte" button, bump cache-busting versions |
| `admin/script.js` | Build nav/render map from `sections-registry.js`, show/hide nav items via `canRead()`, wire "Mon compte" button |
| `admin/account.js` (new) | "Mon compte" panel — change own password (reauth + `updatePassword`) |
| `admin/users.js` (new) | "Utilisateurs" tab — list accounts, create via secondary Firebase App, edit permissions |
| `admin/blocks.js` | Gate add/edit/delete/reorder/visibility controls on `canWrite('blocks')` |
| `admin/guests.js` | Gate add/edit/delete controls on `canWrite('guests')` (view/copy-link stay available to read-only) |
| `admin/events.js` | Gate add/edit/delete controls on `canWrite('events')` |
| `admin/styles.css` | Small additions: `.password-reveal`, sidebar-footer button spacing |

---

### Task 1: Sections registry

**Files:**
- Create: `admin/sections-registry.js`

**Interfaces:**
- Produces: `SECTIONS` — array of `{ id: string, label: string, collection: string }`, exported. Every later task that needs the list of permissioned sections imports this.

- [ ] **Step 1: Create the registry**

```javascript
// admin/sections-registry.js
export const SECTIONS = [
  { id: 'blocks', label: 'Blocs', collection: 'blocks' },
  { id: 'guests', label: 'Invités', collection: 'guests' },
  { id: 'events', label: 'Événements', collection: 'events' },
  { id: 'users', label: 'Utilisateurs', collection: 'admins' },
];
```

- [ ] **Step 2: Verify it loads**

Open `admin/index.html` in the browser (existing single-user flow still works, this file isn't wired in yet). In the browser devtools console, run:
```javascript
const { SECTIONS } = await import('./sections-registry.js');
console.log(SECTIONS.length); // expect 4
```
Expected: `4`, no error.

- [ ] **Step 3: Commit**

```bash
git add admin/sections-registry.js
git commit -m "feat: add central admin sections registry"
```

---

### Task 2: Permissions module

**Files:**
- Create: `admin/permissions.js`

**Interfaces:**
- Consumes: `db` from `../firebase-init.js`.
- Produces: `loadPermissions(uid): Promise<object>`, `getPermission(sectionId): 'none'|'read'|'write'`, `canRead(sectionId): boolean`, `canWrite(sectionId): boolean`. All later tasks that gate UI on permissions import `canRead`/`canWrite` from here; `admin/auth.js` calls `loadPermissions`.

- [ ] **Step 1: Create the module**

```javascript
// admin/permissions.js
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
```

The `try/catch` matters: until Task 3's rules are deployed and Task 4's seed doc exists, reading `admins/{uid}` will be denied — this must degrade to "no permissions" rather than throw and break login.

- [ ] **Step 2: Verify in isolation**

In the browser devtools console (any admin page, logged in or not — this only reads state, no DOM dependency):
```javascript
const { getPermission, canRead, canWrite } = await import('./permissions.js');
console.log(getPermission('guests'), canRead('guests'), canWrite('guests'));
// expect: 'none' false false  (nothing loaded yet)
```
Expected: `none false false`.

- [ ] **Step 3: Commit**

```bash
git add admin/permissions.js
git commit -m "feat: add permissions module for per-section access checks"
```

---

### Task 3: Firestore rules — permission-based access

**Files:**
- Modify: `firestore.rules` (full replace)

**Interfaces:**
- Produces: security rules that every later Firestore read/write depends on. The `admins` collection self-bootstrap clause is what lets Task 4's seed script create the first `admins` doc.

- [ ] **Step 1: Replace the rules file**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function perm(section) {
      return get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.permissions[section];
    }

    match /events/{eventId} {
      allow read: if true;
      allow write: if perm('events') == 'write';
    }

    match /guests/{guestId} {
      allow get: if true;
      allow list: if perm('guests') in ['read', 'write'];
      allow create, delete: if perm('guests') == 'write';
      allow update: if perm('guests') == 'write'
        || request.resource.data.diff(resource.data).affectedKeys().hasOnly(['rsvp']);
    }

    match /blocks/{blockId} {
      allow read: if true;
      allow write: if perm('blocks') == 'write';
    }

    match /admins/{uid} {
      allow get: if request.auth != null && request.auth.uid == uid;
      allow get, list: if perm('users') in ['read', 'write'];
      allow create: if perm('users') == 'write'
        || (request.auth != null && request.auth.uid == uid
            && !exists(/databases/$(database)/documents/admins/$(uid))
            && request.auth.token.email == 'sophbyr@gmail.com');
      allow update, delete: if perm('users') == 'write';
    }
  }
}
```

Notes for the implementer:
- `get()`/`exists()` calls inside rules bypass security rules themselves (privileged reads for rule evaluation) — no infinite recursion.
- The self-bootstrap `create` clause is intentionally narrow: only the hardcoded owner email, only when their own doc doesn't exist yet. It's a permanent recovery mechanism (if the owner's `admins` doc is ever deleted, they can re-seed), not a one-time hack to remove later.
- `guests` keeps its existing carve-out allowing unauthenticated RSVP updates limited to the `rsvp` field — unchanged from the current rules.

- [ ] **Step 2: Visually verify syntax**

Confirm brace/bracket balance and that every `match` block matches the structure above exactly (mismatched braces are the only realistic syntax failure here — there's no local rules linter in this project).

- [ ] **Step 3: Deploy — ask before running**

This changes production security rules and will start denying every write from the current single admin account until Task 4 seeds their `admins` doc. Confirm with the user, then run:

```bash
firebase deploy --only firestore:rules
```

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat: rewrite Firestore rules for per-section admin permissions"
```

---

### Task 4: Seed the owner's admin doc

**Files:**
- Create: `admin/seed-admin.html`
- Create: `admin/seed-admin.js`

**Interfaces:**
- Consumes: `db`, `auth` from `../firebase-init.js`; `initAuth` from `./auth.js` (note: `auth.js` isn't updated to call `loadPermissions` until Task 5, so this page's login flow is unaffected by that dependency at this point in the plan).
- Produces: `admins/{ownerUid}` doc with full-write permissions — every later task's manual testing assumes this doc exists.

- [ ] **Step 1: Create the seed page**

```html
<!-- admin/seed-admin.html -->
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Seed compte admin — Sophie &amp; Ruiyuan</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>

<div id="login-screen" class="login-screen">
  <form id="login-form" class="login-form">
    <h1>Connexion requise</h1>
    <label class="field"><span>Email</span><input id="login-email" type="email" required></label>
    <label class="field"><span>Mot de passe</span><input id="login-password" type="password" required></label>
    <p id="login-error" class="login-error" hidden></p>
    <button type="submit" class="btn-primary">Se connecter</button>
  </form>
</div>

<div id="dashboard" class="dashboard" hidden>
  <header class="topbar">
    <h1>Seed compte admin (usage unique)</h1>
    <button id="logout-btn" class="btn-secondary">Se déconnecter</button>
  </header>
  <button id="seed-btn" class="btn-primary">Créer mon compte admin (accès complet)</button>
  <pre id="seed-log" class="seed-log"></pre>
</div>

<script type="module" src="seed-admin.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create the seed script**

```javascript
// admin/seed-admin.js
import { db, auth } from '../firebase-init.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { initAuth } from './auth.js';

function log(msg) {
  document.getElementById('seed-log').textContent += msg + '\n';
}

document.getElementById('seed-btn').addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) { log('Non connecté.'); return; }
  try {
    await setDoc(doc(db, 'admins', user.uid), {
      email: user.email,
      permissions: { blocks: 'write', guests: 'write', events: 'write', users: 'write' },
      createdAt: new Date().toISOString(),
      createdBy: user.uid,
    });
    log(`Créé : admins/${user.uid} (${user.email}) avec accès complet.`);
  } catch (err) {
    log(`Erreur : ${err.message}`);
  }
});

initAuth({ onSignedIn: () => {}, onSignedOut: () => {} });
```

- [ ] **Step 3: Run it — ask before running**

This writes to production Firestore. Confirm with the user, then: open `admin/seed-admin.html` in the browser, log in with the existing admin account (sophbyr@gmail.com), click "Créer mon compte admin". Expected log line: `Créé : admins/<uid> (sophbyr@gmail.com) avec accès complet.` with no error line.

Verify in the Firebase console (Firestore Data tab) that `admins/{uid}` now exists with the four `'write'` permissions.

- [ ] **Step 4: Commit**

```bash
git add admin/seed-admin.html admin/seed-admin.js
git commit -m "feat: add one-shot seed page for owner's admin permissions doc"
```

---

### Task 5: Wire permissions into the login flow

**Files:**
- Modify: `admin/auth.js:1-38` (full file)

**Interfaces:**
- Consumes: `loadPermissions` from `./permissions.js` (Task 2).
- Produces: guarantees `loadPermissions` has resolved before `onSignedIn(user)` is called — Task 6 relies on `canRead`/`canWrite` already reflecting the current user by the time it builds the sidebar.

- [ ] **Step 1: Update auth.js**

```javascript
// admin/auth.js
import { auth } from '../firebase-init.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { loadPermissions } from './permissions.js';

export function initAuth({ onSignedIn, onSignedOut }) {
  const loginScreen = document.getElementById('login-screen');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      loginError.textContent = 'Email ou mot de passe incorrect.';
      loginError.hidden = false;
    }
  });

  logoutBtn.addEventListener('click', () => signOut(auth));

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await loadPermissions(user.uid);
      loginScreen.hidden = true;
      dashboard.hidden = false;
      onSignedIn(user);
    } else {
      loginScreen.hidden = false;
      dashboard.hidden = true;
      onSignedOut();
    }
  });
}
```

- [ ] **Step 2: Verify login still works**

Open `admin/index.html`, log in as the owner. Expected: dashboard appears as before (Task 6 hasn't wired sidebar visibility yet, so all nav items still show — this task alone shouldn't change visible behavior).

- [ ] **Step 3: Commit**

```bash
git add admin/auth.js
git commit -m "feat: load admin permissions before signaling sign-in"
```

---

### Task 6: Dynamic sidebar + "Utilisateurs" tab scaffold + "Mon compte" button

**Files:**
- Modify: `admin/index.html:29-70`
- Modify: `admin/script.js:1-34` (full file)

**Interfaces:**
- Consumes: `SECTIONS` from `./sections-registry.js` (Task 1), `canRead` from `./permissions.js` (Task 2), `renderUsersTab` from `./users.js` (Task 8 — not yet created; see note below), `openAccountPanel` from `./account.js` (Task 7 — not yet created; see note below).
- Produces: `#tab-users` panel and `data-section="users"` nav button that Task 8 renders into; `#account-btn` that Task 7 wires up.

Note on ordering: this task imports `./users.js` and `./account.js`, which don't exist yet. That's fine — Tasks 7 and 8 create them next, and this task's own manual test (Step 4) is run only after Task 8 completes. Do not skip Tasks 7/8.

- [ ] **Step 1: Update index.html**

Replace lines 29-70 (the `#dashboard` block through the closing `</main></div>`) with:

```html
<div id="dashboard" class="dashboard" hidden>
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="sidebar-brand-logo">S·R</div>
      <div>
        <div class="sidebar-brand-title">S &amp; R</div>
        <div class="sidebar-brand-sub">Administration</div>
      </div>
    </div>
    <nav class="sidebar-nav">
      <button class="nav-item active" data-section="dashboard">
        <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg></span> Accueil
      </button>
      <button class="nav-item" data-section="blocks" hidden>
        <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></span> Blocs
      </button>
      <button class="nav-item" data-section="guests" hidden>
        <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span> Invités
      </button>
      <button class="nav-item" data-section="events" hidden>
        <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></span> Événements
      </button>
      <button class="nav-item" data-section="users" hidden>
        <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/></svg></span> Utilisateurs
      </button>
    </nav>
    <div class="sidebar-footer">
      <button id="account-btn" class="btn-secondary sidebar-logout">Mon compte</button>
      <button id="logout-btn" class="btn-secondary sidebar-logout">Se déconnecter</button>
    </div>
  </aside>
  <main class="content-area">
    <div class="content-header">
      <h2 id="section-title">Accueil</h2>
      <div id="section-action"></div>
    </div>
    <div class="content-body">
      <div id="tab-dashboard" class="tab-panel"></div>
      <div id="tab-blocks" class="tab-panel" hidden></div>
      <div id="tab-guests" class="tab-panel" hidden></div>
      <div id="tab-events" class="tab-panel" hidden></div>
      <div id="tab-users" class="tab-panel" hidden></div>
    </div>
  </main>
</div>
```

Also bump the stylesheet and script cache-busting versions — change line 7 `<link rel="stylesheet" href="styles.css?v=8">` to `<link rel="stylesheet" href="styles.css?v=9">`, and line 70 `<script type="module" src="script.js?v=8"></script>` to `<script type="module" src="script.js?v=9"></script>`.

- [ ] **Step 2: Replace script.js**

```javascript
// admin/script.js
import { initAuth } from './auth.js';
import { renderDashboardTab } from './dashboard.js?v=1';
import { renderBlocksTab } from './blocks.js?v=4';
import { renderGuestsTab } from './guests.js?v=3';
import { renderEventsTab } from './events.js';
import { renderUsersTab } from './users.js';
import { openAccountPanel } from './account.js';
import { canRead } from './permissions.js';
import { SECTIONS as PERM_SECTIONS } from './sections-registry.js';

const RENDER_BY_ID = {
  blocks: renderBlocksTab,
  guests: renderGuestsTab,
  events: renderEventsTab,
  users: renderUsersTab,
};

const NAV_SECTIONS = {
  dashboard: { title: 'Accueil', render: renderDashboardTab },
};
PERM_SECTIONS.forEach(s => {
  NAV_SECTIONS[s.id] = { title: s.label, render: RENDER_BY_ID[s.id] };
});

function updateNavVisibility() {
  PERM_SECTIONS.forEach(s => {
    const btn = document.querySelector(`.nav-item[data-section="${s.id}"]`);
    if (btn) btn.hidden = !canRead(s.id);
  });
}

function switchToSection(section) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = true; });
  document.getElementById('tab-' + section).hidden = false;
  document.getElementById('section-title').textContent = NAV_SECTIONS[section].title;
  NAV_SECTIONS[section].render();
}

function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchToSection(btn.dataset.section));
  });
  document.getElementById('account-btn').addEventListener('click', openAccountPanel);
}

initNav();
initAuth({
  onSignedIn: () => {
    updateNavVisibility();
    switchToSection('dashboard');
  },
  onSignedOut: () => {},
});
```

- [ ] **Step 3: Update blocks.js / guests.js imports to match the new version query strings**

This is just so the browser doesn't serve a stale cached copy — no code change, only confirm `admin/script.js`'s new import lines (`./blocks.js?v=4`, `./guests.js?v=3`) match what Tasks 9 will actually save those files as (Task 9 doesn't change these files' names, so no further action needed here — noted for the implementer running Task 9 later).

- [ ] **Step 4: Verify (after Task 8 is done)**

Open `admin/index.html`, log in as the owner (who now has `admins/{uid}` with all `'write'` from Task 4). Expected: all five nav items visible (Accueil, Blocs, Invités, Événements, Utilisateurs), dashboard renders by default, clicking "Utilisateurs" shows the (still empty-ish) tab from Task 8.

- [ ] **Step 5: Commit**

```bash
git add admin/index.html admin/script.js
git commit -m "feat: build admin sidebar from permissions, add Utilisateurs tab and Mon compte button"
```

---

### Task 7: "Mon compte" — self password change

**Files:**
- Create: `admin/account.js`

**Interfaces:**
- Consumes: `auth` from `../firebase-init.js`.
- Produces: `openAccountPanel()` — called by `admin/script.js`'s `#account-btn` listener (Task 6).

- [ ] **Step 1: Create account.js**

```javascript
// admin/account.js
import { auth } from '../firebase-init.js';
import {
  EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function openAccountPanel() {
  const user = auth.currentUser;

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>Mon compte</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="field"><span>Email</span><div>${escapeHtml(user.email)}</div></div>
      <label class="field">
        <span>Mot de passe actuel</span>
        <input id="acc-current-pw" type="password" required>
      </label>
      <label class="field">
        <span>Nouveau mot de passe</span>
        <input id="acc-new-pw" type="password" required minlength="6">
      </label>
      <label class="field">
        <span>Confirmer le nouveau mot de passe</span>
        <input id="acc-confirm-pw" type="password" required minlength="6">
      </label>
      <p id="acc-error" class="login-error" hidden></p>
      <p id="acc-success" hidden style="color:#15803d;font-size:13px">Mot de passe mis à jour.</p>
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">Mettre à jour</button>
      <button class="btn-secondary" id="panel-cancel">Fermer</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const errorEl = panelEl.querySelector('#acc-error');
    const successEl = panelEl.querySelector('#acc-success');
    errorEl.hidden = true;
    successEl.hidden = true;

    const currentPw = panelEl.querySelector('#acc-current-pw').value;
    const newPw = panelEl.querySelector('#acc-new-pw').value;
    const confirmPw = panelEl.querySelector('#acc-confirm-pw').value;

    if (newPw !== confirmPw) {
      errorEl.textContent = 'Les mots de passe ne correspondent pas.';
      errorEl.hidden = false;
      return;
    }

    const saveBtn = panelEl.querySelector('#panel-save');
    saveBtn.disabled = true;
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);
      successEl.hidden = false;
      panelEl.querySelector('#acc-current-pw').value = '';
      panelEl.querySelector('#acc-new-pw').value = '';
      panelEl.querySelector('#acc-confirm-pw').value = '';
    } catch (err) {
      errorEl.textContent = 'Mot de passe actuel incorrect.';
      errorEl.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });
}
```

Reauthentication is required here because Firebase's `updatePassword` throws `auth/requires-recent-login` if the session isn't fresh — asking for the current password up front avoids a confusing failure on save.

- [ ] **Step 2: Verify manually**

This can only be fully tested once `#account-btn` exists (Task 6). After Task 6 lands: log in, click "Mon compte", enter the correct current password and a new password twice, submit. Expected: "Mot de passe mis à jour." appears, no error. Log out and back in with the new password to confirm it took effect, then set it back if this is the production owner account.

- [ ] **Step 3: Commit**

```bash
git add admin/account.js
git commit -m "feat: add self-service password change panel"
```

---

### Task 8: "Utilisateurs" tab — list, invite, edit permissions

**Files:**
- Create: `admin/users.js`

**Interfaces:**
- Consumes: `db`, `auth` from `../firebase-init.js`; `firebaseConfig` from `../firebase-config.js`; `SECTIONS` from `./sections-registry.js`; `canWrite` from `./permissions.js`.
- Produces: `renderUsersTab()` — called by `admin/script.js` (Task 6).

- [ ] **Step 1: Create users.js**

```javascript
// admin/users.js
import { db, auth } from '../firebase-init.js';
import {
  collection, getDocs, doc, setDoc, updateDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  initializeApp, deleteApp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getAuth, createUserWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { firebaseConfig } from '../firebase-config.js';
import { SECTIONS } from './sections-registry.js';
import { canWrite } from './permissions.js';

const adminsCol = collection(db, 'admins');
const LEVEL_LABELS = { none: 'Aucun', read: 'Lecture', write: 'Modification' };

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let pw = '';
  for (let i = 0; i < length; i++) pw += chars[bytes[i] % chars.length];
  return pw;
}

async function loadUsers() {
  const snap = await getDocs(adminsCol);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function permSummary(permissions) {
  return SECTIONS
    .map(s => `${s.label}: ${LEVEL_LABELS[permissions?.[s.id] || 'none']}`)
    .join(' · ');
}

function renderUserRow(u, editable) {
  return `
    <tr>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(permSummary(u.permissions))}</td>
      <td>${editable
        ? `<div class="table-actions"><button class="btn-secondary btn-edit-user" data-id="${escapeHtml(u.id)}">Modifier</button></div>`
        : ''}</td>
    </tr>`;
}

export async function renderUsersTab() {
  const panel = document.getElementById('tab-users');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('users');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-user-btn" class="btn-primary">+ Inviter un utilisateur</button>'
    : '';

  let users;
  try {
    users = await loadUsers();
  } catch (err) {
    panel.innerHTML = `<p style="padding:20px;color:var(--danger)">Erreur : ${escapeHtml(err.message)}</p>`;
    return;
  }

  panel.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr><th>Email</th><th>Permissions</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${users.length
          ? users.map(u => renderUserRow(u, editable)).join('')
          : '<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:40px">Aucun utilisateur.</td></tr>'}
      </tbody>
    </table>`;

  if (editable) {
    document.getElementById('add-user-btn').addEventListener('click', () => openUserPanel(null, users));
    panel.querySelectorAll('.btn-edit-user').forEach(btn =>
      btn.addEventListener('click', () => openUserPanel(btn.dataset.id, users))
    );
  }
}

function renderPermissionFields(permissions) {
  return SECTIONS.map(s => {
    const current = permissions?.[s.id] || 'none';
    return `
      <label class="field">
        <span>${escapeHtml(s.label)}</span>
        <select id="perm-${s.id}">
          ${['none', 'read', 'write'].map(level =>
            `<option value="${level}" ${current === level ? 'selected' : ''}>${LEVEL_LABELS[level]}</option>`
          ).join('')}
        </select>
      </label>`;
  }).join('');
}

async function createAuthAccount(email, password) {
  const secondaryApp = initializeApp(firebaseConfig, 'secondary-' + Date.now());
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await signOut(secondaryAuth);
    return cred.user.uid;
  } finally {
    await deleteApp(secondaryApp);
  }
}

function openUserPanel(id, users) {
  const user = id ? users.find(u => u.id === id) : null;
  const isNew = !user;
  const generatedPassword = isNew ? generatePassword() : null;

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';

  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>${isNew ? 'Inviter un utilisateur' : 'Modifier les permissions'}</h3>
      <button class="btn-icon" id="panel-close">✕</button>
    </div>
    <div class="panel-body">
      ${isNew ? `
        <label class="field">
          <span>Email</span>
          <input id="user-email" type="email" required>
        </label>
        <div class="field">
          <span>Mot de passe temporaire (généré)</span>
          <div class="password-reveal">
            <code id="user-password">${escapeHtml(generatedPassword)}</code>
            <button type="button" class="btn-secondary" id="copy-password">Copier</button>
          </div>
        </div>` : `
        <div class="field"><span>Email</span><div>${escapeHtml(user.email)}</div></div>`}
      ${renderPermissionFields(user?.permissions)}
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">${isNew ? 'Créer' : 'Enregistrer'}</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(panelEl);

  function close() { overlay.remove(); panelEl.remove(); renderUsersTab(); }
  panelEl.querySelector('#panel-close').addEventListener('click', close);
  panelEl.querySelector('#panel-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);

  if (isNew) {
    panelEl.querySelector('#copy-password').addEventListener('click', async () => {
      await navigator.clipboard.writeText(generatedPassword);
      panelEl.querySelector('#copy-password').textContent = 'Copié !';
    });
  }

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const saveBtn = panelEl.querySelector('#panel-save');
    saveBtn.disabled = true;
    saveBtn.textContent = isNew ? 'Création…' : 'Enregistrement…';

    const permissions = {};
    SECTIONS.forEach(s => {
      permissions[s.id] = panelEl.querySelector(`#perm-${s.id}`).value;
    });

    try {
      if (isNew) {
        const email = panelEl.querySelector('#user-email').value.trim();
        if (!email) throw new Error('no-email');
        const uid = await createAuthAccount(email, generatedPassword);
        await setDoc(doc(db, 'admins', uid), {
          email,
          permissions,
          createdAt: new Date().toISOString(),
          createdBy: auth.currentUser.uid,
        });
      } else {
        await updateDoc(doc(db, 'admins', id), { permissions });
      }
      close();
    } catch (err) {
      console.error(err);
      saveBtn.disabled = false;
      saveBtn.textContent = isNew ? 'Créer' : 'Enregistrer';
    }
  });
}
```

- [ ] **Step 2: Add supporting CSS**

Append to the end of `admin/styles.css` (after the existing `.section-list-add{align-self:flex-start}` line):

```css

/* ── Utilisateurs / Mon compte ── */
.password-reveal{display:flex;align-items:center;gap:8px}
.password-reveal code{flex:1;padding:8px 11px;border:1px solid var(--border);border-radius:6px;font-family:ui-monospace,monospace;background:#f9fafb}
.sidebar-footer .sidebar-logout + .sidebar-logout{margin-top:6px}
```

- [ ] **Step 3: End-to-end manual verification**

This is the first point where the whole feature can be exercised together (Tasks 5-8 all land). With Task 6 and 7 already committed:

1. Log in as the owner. Confirm all 5 nav items show.
2. Go to "Utilisateurs" → "+ Inviter un utilisateur". Enter a real test email you control, note the generated password, click "Créer".
3. Confirm the new row appears in the users list with `Blocs: Aucun · Invités: Aucun · Événements: Aucun · Utilisateurs: Aucun`.
4. Click "Modifier" on that row, set `Invités` to `Lecture`, save.
5. Log out. Log back in as the invited test account (email + generated password).
6. Confirm only "Accueil" and "Invités" show in the sidebar — no "+ Ajouter un invité" button, no "Modifier"/"Supprimer" buttons on guest rows, but the guest list itself and "Réponse" detail view are visible.
7. Log back in as the owner, set the test account's `Invités` to `Modification`, log back in as the test account, confirm the add/edit/delete controls now appear.
8. Clean up: delete the test Firebase Auth account from the Firebase console (no delete-user UI exists yet, per spec §8 — this is expected) and its `admins/{uid}` Firestore doc.

- [ ] **Step 4: Commit**

```bash
git add admin/users.js admin/styles.css
git commit -m "feat: add Utilisateurs tab with invite and permission editing"
```

---

### Task 9: Gate write controls in Blocs, Invités, Événements

**Files:**
- Modify: `admin/blocks.js:124-225` (`renderBlockRow`, `renderBlocksTab`)
- Modify: `admin/guests.js:36-68, 129-181` (`renderGuestRow`, `renderGuestsTab`)
- Modify: `admin/events.js:1-67` (imports, `renderEventsTab`)

**Interfaces:**
- Consumes: `canWrite` from `./permissions.js`.

- [ ] **Step 1: Update blocks.js**

Add the import at the top (after the existing imports, line 6):
```javascript
import { canWrite } from './permissions.js';
```

Replace `renderBlockRow` (lines 124-150) with:
```javascript
function renderBlockRow(block, idx, total, editable) {
  const def = TYPE_DEFS[block.type] || { label: block.type };
  const title = (block.type === 'text' || block.type === 'image')
    ? escapeHtml(block.title_fr || '(sans titre)')
    : escapeHtml(def.label);
  const moveCell = editable
    ? `<button class="btn-icon btn-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
       <button class="btn-icon btn-down" data-idx="${idx}" ${idx === total - 1 ? 'disabled' : ''}>↓</button>`
    : '';
  const visibleCell = editable
    ? `<label class="toggle">
         <input type="checkbox" class="toggle-visible" data-id="${block.id}" ${block.visible ? 'checked' : ''}>
         <span class="toggle-track"></span>
       </label>`
    : `<span class="badge ${block.visible ? 'badge-confirmed' : 'badge-declined'}">${block.visible ? 'Oui' : 'Non'}</span>`;
  const actionsCell = editable
    ? `<div class="table-actions">
         <button class="btn-secondary btn-edit" data-id="${block.id}">Modifier</button>
         <button class="btn-danger btn-delete" data-id="${block.id}">Supprimer</button>
       </div>`
    : '';
  return `
    <tr>
      <td>${moveCell}</td>
      <td><span class="badge">${escapeHtml(def.label)}</span></td>
      <td>${title}</td>
      <td>${visibleCell}</td>
      <td>${actionsCell}</td>
    </tr>`;
}
```

Replace the body of `renderBlocksTab` (lines 152-225) with:
```javascript
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

  const editable = canWrite('blocks');
  const filtered = allBlocks.filter(b => (b.audience || 'invite') === activeAudience);

  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-block-btn" class="btn-primary">+ Ajouter un bloc</button>'
    : '';

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
          ? filtered.map((b, i) => renderBlockRow(b, i, filtered.length, editable)).join('')
          : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:40px">Aucun bloc — ajoutez-en un !</td></tr>'}
      </tbody>
    </table>`;

  panel.querySelectorAll('.subtab-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      activeAudience = btn.dataset.aud;
      renderBlocksTab();
    })
  );

  if (editable) {
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
}
```

- [ ] **Step 2: Update guests.js**

Add the import after line 6 (`import { loadEvents } from './events.js';`):
```javascript
import { canWrite } from './permissions.js';
```

Replace `renderGuestRow` (lines 36-68) with:
```javascript
function renderGuestRow(g, eventById, editable) {
  const side = g.side || 'deux';
  const pills = (g.assignedEvents || [])
    .map(id => eventById[id]
      ? `<span class="pill">${escapeHtml(eventById[id].title_fr)}</span>`
      : '')
    .join('');
  const rsvp = g.rsvp || {};
  const STATUS_LABELS = { confirmed: 'Confirmé', declined: 'Décliné', pending: 'En attente' };
  const STATUS_BADGE = { confirmed: 'badge-confirmed', declined: 'badge-declined', pending: 'badge-pending' };
  const status = rsvp.status || 'pending';
  const statusLabel = STATUS_LABELS[status] || STATUS_LABELS.pending;
  const statusClass = STATUS_BADGE[status] || STATUS_BADGE.pending;
  const actionsCell = editable
    ? `<div class="table-actions">
         <button class="btn-secondary btn-view-rsvp" data-id="${escapeHtml(g.id)}">Réponse</button>
         <button class="btn-secondary btn-edit-guest" data-id="${escapeHtml(g.id)}">Modifier</button>
         <button class="btn-danger btn-delete-guest" data-id="${escapeHtml(g.id)}">Supprimer</button>
       </div>`
    : `<div class="table-actions">
         <button class="btn-secondary btn-view-rsvp" data-id="${escapeHtml(g.id)}">Réponse</button>
       </div>`;
  return `
    <tr class="guest-row" data-id="${escapeHtml(g.id)}">
      <td>${escapeHtml(g.name)}</td>
      <td><span class="badge ${SIDE_BADGE[side]}">${SIDE_LABELS[side]}</span></td>
      <td><div class="pills">${pills}</div></td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>${rsvp.adults ?? ''}</td>
      <td>${rsvp.children ?? ''}</td>
      <td>
        <button class="btn-icon btn-copy-link" data-token="${escapeHtml(g.id)}" title="Copier le lien">${LINK_ICON}</button>
      </td>
      <td>${actionsCell}</td>
    </tr>`;
}
```

Replace the body of `renderGuestsTab` (lines 129-181) with:
```javascript
export async function renderGuestsTab() {
  const panel = document.getElementById('tab-guests');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('guests');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-guest-btn" class="btn-primary">+ Ajouter un invité</button>'
    : '';

  const [guests, events] = await Promise.all([loadGuests(), loadEvents()]);
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));
  const stats = computeStats(guests);

  panel.innerHTML = `
    ${renderStatsBar(stats)}
    <table class="admin-table">
      <thead>
        <tr>
          <th>Nom</th><th>Côté</th><th>Événements</th><th>RSVP</th>
          <th>Adultes</th><th>Enfants</th><th>Lien</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${guests.length
          ? guests.map(g => renderGuestRow(g, eventById, editable)).join('')
          : '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:40px">Aucun invité.</td></tr>'}
      </tbody>
    </table>`;

  if (editable) {
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
  }
  panel.querySelectorAll('.btn-view-rsvp').forEach(btn =>
    btn.addEventListener('click', () => openRsvpDetail(guests.find(g => g.id === btn.dataset.id), eventById))
  );
  panel.querySelectorAll('.btn-copy-link').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = `${location.origin}/?invite=${btn.dataset.token}`;
      await navigator.clipboard.writeText(url);
      const orig = btn.innerHTML;
      btn.innerHTML = CHECK_ICON;
      setTimeout(() => { btn.innerHTML = orig; }, 1500);
    });
  });
}
```

- [ ] **Step 3: Update events.js**

Add the import after line 6 (end of the firestore import block):
```javascript
import { canWrite } from './permissions.js';
```

Replace `renderEventsTab` (lines 22-67) with:
```javascript
export async function renderEventsTab() {
  const panel = document.getElementById('tab-events');
  panel.innerHTML = '<p style="padding:20px;color:var(--muted)">Chargement…</p>';

  const editable = canWrite('events');
  document.getElementById('section-action').innerHTML = editable
    ? '<button id="add-event-btn" class="btn-primary">+ Ajouter un événement</button>'
    : '';

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
            <td>${editable
              ? `<div class="table-actions">
                   <button class="btn-secondary btn-edit-event" data-id="${ev.id}">Modifier</button>
                   <button class="btn-danger btn-delete-event" data-id="${ev.id}">Supprimer</button>
                 </div>`
              : ''}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  if (editable) {
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
}
```

- [ ] **Step 4: Manual verification**

Repeat the read-only checks from Task 8 Step 3 for Blocs and Événements specifically: log in as a test account with `blocks: 'read'` and confirm no "+ Ajouter un bloc" button, no move/edit/delete/toggle controls, but the block list itself renders. Same for `events: 'read'`. Then set both to `'write'` and confirm all controls reappear.

- [ ] **Step 5: Commit**

```bash
git add admin/blocks.js admin/guests.js admin/events.js
git commit -m "feat: gate write controls in Blocs, Invités, Événements on permissions"
```

---

## Post-plan cleanup (not a task — reminder for the user)

`admin/seed-admin.html`/`admin/seed-admin.js` (Task 4) and `admin/seed.html`/`admin/seed.js` (pre-existing) are one-shot tools. Nothing in this plan removes them — they stay available as a recovery path (spec §6's self-bootstrap clause is designed to keep working). No action needed unless the user wants them deleted later.
