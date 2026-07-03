# Guest Back Office (Firebase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared-invite-code guest site with a Firebase-backed system: an admin back office to manage individual guests (name, side, assigned events, RSVP status) and per-guest invite links, and a guest-facing site that looks up its data by token and writes RSVP responses back.

**Architecture:** Firestore (`events`, `guests` collections) + Firebase Auth (email/password, admin only) as the shared backend. Two static, no-build vanilla-JS apps consume it: the existing guest site (`index.html`/`script.js`) and a new admin app (`admin/`). Both load the Firebase JS SDK as CDN ES modules through one shared `firebase-init.js`.

**Tech Stack:** Firebase JS SDK v10.7.1 (Firestore + Auth), plain HTML/CSS/JS, no bundler, no framework.

## Global Constraints

- Pin the Firebase JS SDK to `10.7.1` everywhere, loaded from `https://www.gstatic.com/firebasejs/10.7.1/<package>.js` — do not mix versions across files.
- No bundler, no npm build step. Every JS file is loaded directly as `<script type="module">` or `import`ed as an ES module.
- The 4 seed event doc IDs are exactly `the`, `resto`, `mairie`, `soiree` — matching the IDs already used in the current hardcoded `EVENTS` object. Do not rename them.
- A guest's Firestore document ID **is** their invite token. Never store the token as a separate field — the invite link is `?invite=<docId>`.
- Firestore security rules (Task 2) are the single source of truth for what's public vs admin-only. No task should work around them client-side.
- Admin UI copy is French (matches the couple's own working language for this tool). Guest-facing site keeps its existing FR/ZH toggle, untouched.
- No automated test framework exists in this project (plain static site). Every task's "test" step is manual verification through the browser preview tools (`mcp__Claude_Preview__*`), same method used to build the original site — check console for errors, confirm rendered state, confirm Firestore state where relevant.
- Sections of the guest site not mentioned in this plan (hero, histoire, infos pratiques, hébergement, cadeau, dress code, galerie, footer, `PLACES`, `HOTELS`) are unaffected — do not touch them.

---

## File Structure

```
firebase-config.js       # NEW — Firebase web config values (user-supplied, public-safe)
firebase-init.js         # NEW — initializeApp + exports `db`, `auth`, shared by both apps
firestore.rules          # NEW — security rules
firestore.indexes.json   # NEW — empty index manifest (required by firebase.json)
firebase.json            # NEW — points firebase-tools at the rules file
.firebaserc              # NEW — Firebase project alias

admin/index.html         # NEW — back office shell (login screen + dashboard)
admin/styles.css         # NEW — utilitarian admin styles
admin/auth.js            # NEW — login/logout/session guard
admin/events.js          # NEW — events CRUD + render
admin/guests.js          # NEW — guests CRUD + render + token generation
admin/script.js          # NEW — bootstrap: tabs + wires auth.js/events.js/guests.js
admin/seed.html          # NEW — one-time authenticated page to seed the 4 events
admin/seed.js            # NEW — seed logic

index.html                # MODIFY — add loading screen, gate envelope, module script tag
styles.css                 # MODIFY — add .loading-screen styles, drop unused .rsvp-demo-note
script.js                  # MODIFY — replace INVITES/EVENTS with Firestore-backed guest lookup + RSVP write-back
```

---

## Task 1: Firebase project & shared config/init modules

**Files:**
- Create: `firebase-config.js`
- Create: `firebase-init.js`

**Interfaces:**
- Produces: `firebase-init.js` exports `db` (Firestore instance) and `auth` (Auth instance), imported by every other JS file that talks to Firebase.

- [ ] **Step 1: Manual Firebase console setup (you — not agent-executable)**

1. Go to https://console.firebase.google.com, create a new project (e.g. "sophie-ruiyuan-wedding").
2. In the project, go to **Build → Firestore Database → Create database**. Choose production mode, pick a region close to France (e.g. `eur3` / `europe-west`).
3. Go to **Build → Authentication → Get started → Sign-in method → Email/Password → Enable**.
4. Go to **Authentication → Users → Add user**, create an account for yourself (and Ruiyuan if wanted) with email + password — this is how you'll log into the back office.
5. Go to **Project settings (gear icon) → General → Your apps → Add app → Web (`</>`)**. Register an app (nickname doesn't matter, don't set up Hosting yet). Copy the `firebaseConfig` object shown.
6. Note your **Project ID** (visible in Project settings) — needed in Task 2.

- [ ] **Step 2: Create `firebase-config.js`**

```js
// firebase-config.js
// Firebase Web config. Safe to expose publicly — real access control lives
// in firestore.rules, not in hiding these values. Replace with the values
// from Firebase console > Project settings > Your apps > SDK setup.
export const firebaseConfig = {
  apiKey: 'REPLACE_WITH_YOUR_API_KEY',
  authDomain: 'REPLACE_WITH_YOUR_PROJECT.firebaseapp.com',
  projectId: 'REPLACE_WITH_YOUR_PROJECT_ID',
  storageBucket: 'REPLACE_WITH_YOUR_PROJECT.appspot.com',
  messagingSenderId: 'REPLACE_WITH_SENDER_ID',
  appId: 'REPLACE_WITH_APP_ID',
};
```

After creating the file, **replace all six `REPLACE_...` placeholders** with the real values copied in Step 1.5. This step cannot be done by the agent — it requires the values from your Firebase console.

- [ ] **Step 3: Create `firebase-init.js`**

```js
// firebase-init.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
```

- [ ] **Step 4: Manual verification**

With the local static server running (`mcp__Claude_Preview__preview_start`), open the browser console via `mcp__Claude_Preview__preview_eval` and run:

```js
import('./firebase-init.js').then(m => console.log('db:', !!m.db, 'auth:', !!m.auth))
```

Expected: logs `db: true auth: true`, no thrown error. If you see `auth/invalid-api-key` or similar, the placeholders in `firebase-config.js` weren't replaced — go back to Step 2.

- [ ] **Step 5: Commit**

```bash
git add firebase-config.js firebase-init.js
git commit -m "feat: add Firebase config and shared init module"
```

---

## Task 2: Firestore security rules

**Files:**
- Create: `firestore.rules`
- Create: `firestore.indexes.json`
- Create: `firebase.json`
- Create: `.firebaserc`

**Interfaces:**
- Consumes: Firebase project ID from Task 1.
- Produces: deployed rules that every later Firestore call (guest site + admin) depends on for correct read/write permissions.

- [ ] **Step 1: Write `firestore.rules`**

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
  }
}
```

- [ ] **Step 2: Write `firestore.indexes.json`**

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

- [ ] **Step 3: Write `firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

(Hosting config is intentionally omitted — deployment target is a separate, non-blocking decision per the design spec.)

- [ ] **Step 4: Write `.firebaserc`**

```json
{
  "projects": {
    "default": "REPLACE_WITH_YOUR_PROJECT_ID"
  }
}
```

Replace `REPLACE_WITH_YOUR_PROJECT_ID` with the Project ID noted in Task 1, Step 1.6.

- [ ] **Step 5: Manual deploy (you — requires Firebase CLI login)**

```bash
npm install -g firebase-tools   # once, if not already installed
firebase login                  # opens a browser for Google auth
firebase deploy --only firestore:rules
```

Expected output ends with `✔  Deploy complete!`.

- [ ] **Step 6: Manual verification**

In the Firebase console, go to **Firestore Database → Rules** and confirm the displayed rules match `firestore.rules` exactly (deploy timestamp should be recent).

- [ ] **Step 7: Commit**

```bash
git add firestore.rules firestore.indexes.json firebase.json .firebaserc
git commit -m "feat: add Firestore security rules"
```

---

## Task 3: Admin app shell + authentication

**Files:**
- Create: `admin/index.html`
- Create: `admin/styles.css`
- Create: `admin/auth.js`
- Create: `admin/script.js`

**Interfaces:**
- Consumes: `db`, `auth` from `../firebase-init.js` (Task 1); admin account created in Task 1, Step 1.4.
- Produces: `admin/auth.js` exports `initAuth({ onSignedIn, onSignedOut })` — later tasks (5, 6) pass callbacks here to render their tab content once logged in. DOM contract: `#tab-guests` and `#tab-events` are the two panel containers later tasks render into.

- [ ] **Step 1: Write `admin/index.html`**

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
  <header class="topbar">
    <h1>Back office — Sophie &amp; Ruiyuan</h1>
    <button id="logout-btn" class="btn-secondary">Se déconnecter</button>
  </header>
  <nav class="tabs">
    <button class="tab-btn active" data-tab="guests">Invités</button>
    <button class="tab-btn" data-tab="events">Événements</button>
  </nav>
  <section id="tab-guests" class="tab-panel"></section>
  <section id="tab-events" class="tab-panel" hidden></section>
</div>

<script type="module" src="script.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `admin/styles.css`**

```css
:root{
  --bordeaux:#6E1A1A;
  --gold:#C1993F;
  --red:#B03A2E;
  --cream:#FBF6EC;
  --ink:#2A211C;
  --taupe:#7a6252;
  --border:#e2d6b8;
}
*{box-sizing:border-box;margin:0;padding:0}
[hidden]{display:none !important}
body{font-family:'EB Garamond',Georgia,serif;background:var(--cream);color:var(--ink);padding:24px}
h1{font-size:22px;margin-bottom:16px}
.login-screen{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bordeaux)}
.login-form{background:#fff;padding:36px;border-radius:6px;display:flex;flex-direction:column;gap:14px;min-width:320px}
.field{display:flex;flex-direction:column;gap:4px}
.field input,.field textarea{padding:8px 10px;border:1px solid var(--border);border-radius:4px;font-size:15px;font-family:inherit}
.login-error{color:var(--red);font-size:14px}
button{cursor:pointer;font-family:inherit}
.btn-primary{background:var(--bordeaux);color:#fff;border:none;padding:10px 18px;border-radius:4px;font-size:14px}
.btn-secondary{background:transparent;border:1px solid var(--bordeaux);color:var(--bordeaux);padding:9px 16px;border-radius:4px;font-size:14px}
.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.tabs{display:flex;gap:8px;margin-bottom:20px}
.tab-btn{background:transparent;border:1px solid var(--border);padding:8px 16px;border-radius:4px;font-size:14px}
.tab-btn.active{background:var(--bordeaux);color:#fff;border-color:var(--bordeaux)}
.admin-table{width:100%;border-collapse:collapse;background:#fff;margin:16px 0}
.admin-table th,.admin-table td{border:1px solid var(--border);padding:8px 10px;font-size:14px;text-align:left}
.admin-table th{background:#f3ead2}
.badge{padding:3px 10px;border-radius:999px;font-size:12px}
.badge-pending{background:#eee;color:#555}
.badge-confirmed{background:#d4edda;color:#1e7e34}
.event-form,.guest-form{background:#fff;padding:20px;border-radius:6px;margin-top:16px;display:flex;flex-direction:column;gap:12px;max-width:480px}
.form-actions{display:flex;gap:10px}
.guest-link-result{background:#f3ead2;padding:10px;border-radius:4px;font-size:14px;word-break:break-all}
.seed-log{background:#fff;padding:16px;border-radius:4px;margin-top:16px;font-size:13px;white-space:pre-wrap}
```

- [ ] **Step 3: Write `admin/auth.js`**

```js
// admin/auth.js
import { auth } from '../firebase-init.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

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

  onAuthStateChanged(auth, (user) => {
    if (user) {
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

- [ ] **Step 4: Write `admin/script.js`**

```js
// admin/script.js
import { initAuth } from './auth.js';

function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
      document.getElementById('tab-' + btn.dataset.tab).hidden = false;
    });
  });
}

initTabs();
initAuth({
  onSignedIn: () => {},
  onSignedOut: () => {},
});
```

- [ ] **Step 5: Manual verification**

1. `mcp__Claude_Preview__preview_start` (reuse existing `static` config, or add an `admin` server pointing at the same root — the existing python server already serves the whole repo, so `http://localhost:8743/admin/` works with no new config).
2. Navigate to `/admin/`. Expected: login form, no dashboard.
3. Submit wrong credentials. Expected: red error text appears, dashboard stays hidden.
4. Submit the real credentials from Task 1. Expected: login screen hides, dashboard shows with "Invités" tab active and empty panel, "Événements" tab panel hidden.
5. Click "Événements" tab. Expected: it becomes active, its (empty) panel shows, guests panel hides.
6. Click "Se déconnecter". Expected: back to login screen.
7. Check `mcp__Claude_Preview__preview_console_logs` (level: error) — expect none.

- [ ] **Step 6: Commit**

```bash
git add admin/index.html admin/styles.css admin/auth.js admin/script.js
git commit -m "feat: add admin app shell with Firebase Auth login"
```

---

## Task 4: Seed the 4 initial events

**Files:**
- Create: `admin/seed.html`
- Create: `admin/seed.js`

**Interfaces:**
- Consumes: `db` from `../firebase-init.js`, `initAuth` from `./auth.js` (Task 3).
- Produces: 4 documents in the `events` collection (`the`, `resto`, `mairie`, `soiree`) that Task 5 (admin events tab) and Task 8 (guest site) both read.

- [ ] **Step 1: Write `admin/seed.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Seed événements — Sophie &amp; Ruiyuan</title>
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
    <h1>Seed événements (usage unique)</h1>
    <button id="logout-btn" class="btn-secondary">Se déconnecter</button>
  </header>
  <button id="seed-btn" class="btn-primary">Créer les 4 événements initiaux</button>
  <pre id="seed-log" class="seed-log"></pre>
</div>

<script type="module" src="seed.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `admin/seed.js`**

```js
// admin/seed.js
import { db } from '../firebase-init.js';
import { doc, setDoc, getDocs, collection } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { initAuth } from './auth.js';

const SEED_EVENTS = [
  { id: 'the', order: 1, zh: '茶', time_fr: '8h00', time_zh: '8:00', title_fr: 'Cérémonie du thé', title_zh: '敬茶仪式', place_fr: 'Au domicile de la famille', place_zh: '于家中', desc_fr: "Un moment intime, réservé aux proches : la cérémonie du thé, geste de respect et de gratitude envers les familles.", desc_zh: '温馨私密的环节，仅限至亲：敬茶仪式，向双方长辈表达敬意与感恩。' },
  { id: 'resto', order: 2, zh: '宴', time_fr: '12h00', time_zh: '12:00', title_fr: 'Déjeuner chinois', title_zh: '中式午宴', place_fr: 'Restaurant (à confirmer)', place_zh: '餐厅（待定）', desc_fr: "Un déjeuner convivial autour d'un banquet chinois, pour prolonger la matinée en famille et amis proches.", desc_zh: '与至亲好友共享中式宴席，延续上午的温馨时光。' },
  { id: 'mairie', order: 3, zh: '证婚', time_fr: '16h00', time_zh: '16:00', title_fr: 'Mariage civil', title_zh: '公证结婚', place_fr: 'Mairie de Lognes', place_zh: '洛涅市政厅', desc_fr: "L'échange des consentements et des alliances, entouré de tous nos invités.", desc_zh: '在所有来宾的见证下，交换誓言与戒指。' },
  { id: 'soiree', order: 4, zh: '喜宴', time_fr: '19h00', time_zh: '19:00', title_fr: 'Soirée', title_zh: '晚宴派对', place_fr: 'Domaine de la Pointe', place_zh: '拉普安特庄园', desc_fr: "Dîner, discours et danse jusqu'au bout de la nuit pour célébrer ensemble.", desc_zh: '晚宴、致辞与舞会，欢庆至深夜。' },
];

function log(msg) {
  document.getElementById('seed-log').textContent += msg + '\n';
}

document.getElementById('seed-btn').addEventListener('click', async () => {
  for (const ev of SEED_EVENTS) {
    const { id, ...data } = ev;
    await setDoc(doc(db, 'events', id), data);
    log(`Créé : ${id}`);
  }
  const snap = await getDocs(collection(db, 'events'));
  log(`Total dans events : ${snap.size}`);
});

initAuth({ onSignedIn: () => {}, onSignedOut: () => {} });
```

- [ ] **Step 2: Manual verification**

1. Navigate to `/admin/seed.html`, log in with the admin account from Task 1.
2. Click "Créer les 4 événements initiaux".
3. Expected: the log area prints `Créé : the`, `Créé : resto`, `Créé : mairie`, `Créé : soiree`, then `Total dans events : 4`.
4. In the Firebase console, go to **Firestore Database → Data**, confirm an `events` collection exists with exactly those 4 documents and the fields match the code above (spot-check `the`: `title_fr` = "Cérémonie du thé", `title_zh` = "敬茶仪式").
5. Click the seed button again. Expected: still exactly 4 docs (writes are idempotent — `setDoc` on the same ID overwrites, doesn't duplicate).

- [ ] **Step 3: Commit**

```bash
git add admin/seed.html admin/seed.js
git commit -m "feat: add one-time events seed page"
```

---

## Task 5: Admin — Events tab (CRUD)

**Files:**
- Create: `admin/events.js`
- Modify: `admin/script.js` (add import + wire into `onSignedIn`)

**Interfaces:**
- Consumes: `db` from `../firebase-init.js`.
- Produces: `admin/events.js` exports `loadEvents()` → `Promise<Array<{id, order, zh, time_fr, time_zh, title_fr, title_zh, place_fr, place_zh, desc_fr, desc_zh}>>` (consumed by `admin/guests.js` in Task 6, and structurally mirrors what the guest site reads in Task 8) and `renderEventsTab()` → renders into `#tab-events`.

- [ ] **Step 1: Write `admin/events.js`**

```js
// admin/events.js
import { db } from '../firebase-init.js';
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const eventsCol = collection(db, 'events');

export async function loadEvents() {
  const snap = await getDocs(query(eventsCol, orderBy('order')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function saveEvent(id, data) {
  if (id) {
    await updateDoc(doc(db, 'events', id), data);
  } else {
    await addDoc(eventsCol, data);
  }
}

async function deleteEvent(id) {
  await deleteDoc(doc(db, 'events', id));
}

export async function renderEventsTab() {
  const panel = document.getElementById('tab-events');
  const events = await loadEvents();

  panel.innerHTML = `
    <button id="add-event-btn" class="btn-primary">+ Ajouter un événement</button>
    <table class="admin-table">
      <thead><tr><th>Ordre</th><th>Titre FR</th><th>Titre ZH</th><th>Heure</th><th>Lieu FR</th><th>Actions</th></tr></thead>
      <tbody>
        ${events.map(ev => `
          <tr>
            <td>${ev.order}</td>
            <td>${ev.title_fr}</td>
            <td>${ev.title_zh}</td>
            <td>${ev.time_fr}</td>
            <td>${ev.place_fr}</td>
            <td>
              <button class="btn-edit-event" data-id="${ev.id}">Modifier</button>
              <button class="btn-delete-event" data-id="${ev.id}">Supprimer</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
    <form id="event-form" class="event-form" hidden>
      <input type="hidden" id="event-id">
      <label class="field"><span>Ordre</span><input id="event-order" type="number" required></label>
      <label class="field"><span>Glyphe (zh)</span><input id="event-zh" required></label>
      <label class="field"><span>Heure FR</span><input id="event-time-fr" required></label>
      <label class="field"><span>Heure ZH</span><input id="event-time-zh" required></label>
      <label class="field"><span>Titre FR</span><input id="event-title-fr" required></label>
      <label class="field"><span>Titre ZH</span><input id="event-title-zh" required></label>
      <label class="field"><span>Lieu FR</span><input id="event-place-fr" required></label>
      <label class="field"><span>Lieu ZH</span><input id="event-place-zh" required></label>
      <label class="field"><span>Description FR</span><textarea id="event-desc-fr" required></textarea></label>
      <label class="field"><span>Description ZH</span><textarea id="event-desc-zh" required></textarea></label>
      <div class="form-actions">
        <button type="submit" class="btn-primary">Enregistrer</button>
        <button type="button" id="event-cancel-btn" class="btn-secondary">Annuler</button>
      </div>
    </form>
  `;

  document.getElementById('add-event-btn').addEventListener('click', () => openEventForm(null, events));
  panel.querySelectorAll('.btn-edit-event').forEach(btn => {
    btn.addEventListener('click', () => openEventForm(btn.dataset.id, events));
  });
  panel.querySelectorAll('.btn-delete-event').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cet événement ?')) return;
      await deleteEvent(btn.dataset.id);
      renderEventsTab();
    });
  });
  document.getElementById('event-cancel-btn').addEventListener('click', () => {
    document.getElementById('event-form').hidden = true;
  });
  document.getElementById('event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('event-id').value || null;
    const data = {
      order: Number(document.getElementById('event-order').value),
      zh: document.getElementById('event-zh').value,
      time_fr: document.getElementById('event-time-fr').value,
      time_zh: document.getElementById('event-time-zh').value,
      title_fr: document.getElementById('event-title-fr').value,
      title_zh: document.getElementById('event-title-zh').value,
      place_fr: document.getElementById('event-place-fr').value,
      place_zh: document.getElementById('event-place-zh').value,
      desc_fr: document.getElementById('event-desc-fr').value,
      desc_zh: document.getElementById('event-desc-zh').value,
    };
    await saveEvent(id, data);
    renderEventsTab();
  });
}

function openEventForm(id, events) {
  const form = document.getElementById('event-form');
  const ev = id ? events.find(e => e.id === id) : null;
  document.getElementById('event-id').value = id || '';
  document.getElementById('event-order').value = ev ? ev.order : events.length + 1;
  document.getElementById('event-zh').value = ev ? ev.zh : '';
  document.getElementById('event-time-fr').value = ev ? ev.time_fr : '';
  document.getElementById('event-time-zh').value = ev ? ev.time_zh : '';
  document.getElementById('event-title-fr').value = ev ? ev.title_fr : '';
  document.getElementById('event-title-zh').value = ev ? ev.title_zh : '';
  document.getElementById('event-place-fr').value = ev ? ev.place_fr : '';
  document.getElementById('event-place-zh').value = ev ? ev.place_zh : '';
  document.getElementById('event-desc-fr').value = ev ? ev.desc_fr : '';
  document.getElementById('event-desc-zh').value = ev ? ev.desc_zh : '';
  form.hidden = false;
}
```

- [ ] **Step 2: Modify `admin/script.js`**

Old:
```js
import { initAuth } from './auth.js';
```

New:
```js
import { initAuth } from './auth.js';
import { renderEventsTab } from './events.js';
```

Old:
```js
initAuth({
  onSignedIn: () => {},
  onSignedOut: () => {},
});
```

New:
```js
initAuth({
  onSignedIn: () => { renderEventsTab(); },
  onSignedOut: () => {},
});
```

- [ ] **Step 3: Manual verification**

1. Ensure Task 4's seed has run (4 events exist).
2. Log into `/admin/`, click "Événements" tab. Expected: table with 4 rows, correct titles/times/places matching the seed data.
3. Click "Modifier" on "Cérémonie du thé", change "Lieu FR" to "Chez les parents", save. Expected: table refreshes, row shows the new place. Reload the page, log in again, check the tab again — change persisted.
4. Click "+ Ajouter un événement", fill all fields with test data (e.g. order 5, title "Test événement"), save. Expected: 5th row appears.
5. Click "Supprimer" on the test row, confirm the dialog. Expected: back to 4 rows.
6. Check console for errors — expect none.

- [ ] **Step 4: Commit**

```bash
git add admin/events.js admin/script.js
git commit -m "feat: add admin events CRUD tab"
```

---

## Task 6: Admin — Guests tab (list + add)

**Files:**
- Create: `admin/guests.js`
- Modify: `admin/script.js` (add import + wire into `onSignedIn`)

**Interfaces:**
- Consumes: `db` from `../firebase-init.js`, `loadEvents()` from `./events.js` (Task 5).
- Produces: `admin/guests.js` exports `renderGuestsTab()` → renders into `#tab-guests`. Guest doc shape written: `{ name, side, assignedEvents: string[], createdAt, rsvp: { status: 'pending', name: '', adults: 0, children: 0, diet: '', message: '', confirmedEvents: {}, respondedAt: null } }` — this is exactly what Task 8/9 (guest site) read and update.

- [ ] **Step 1: Write `admin/guests.js`**

```js
// admin/guests.js
import { db } from '../firebase-init.js';
import { collection, getDocs, doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { loadEvents } from './events.js';

const guestsCol = collection(db, 'guests');

const SIDE_LABELS = { marie: 'Marié', mariee: 'Mariée', deux: 'Les deux' };

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
  const chips = (g.assignedEvents || []).map(id => eventById[id] ? eventById[id].title_fr : id).join(', ');
  const rsvp = g.rsvp || {};
  const statusLabel = rsvp.status === 'confirmed' ? 'Confirmé' : 'En attente';
  const statusClass = rsvp.status === 'confirmed' ? 'badge-confirmed' : 'badge-pending';
  return `
    <tr>
      <td>${g.name}</td>
      <td>${SIDE_LABELS[g.side] || g.side}</td>
      <td>${chips}</td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>${rsvp.adults ?? ''}</td>
      <td>${rsvp.children ?? ''}</td>
      <td>${rsvp.diet ?? ''}</td>
      <td>${rsvp.message ?? ''}</td>
      <td><button class="btn-copy-link" data-token="${g.id}">Copier le lien</button></td>
    </tr>`;
}

export async function renderGuestsTab() {
  const panel = document.getElementById('tab-guests');
  const [guests, events] = await Promise.all([loadGuests(), loadEvents()]);
  const eventById = Object.fromEntries(events.map(e => [e.id, e]));

  panel.innerHTML = `
    <button id="add-guest-btn" class="btn-primary">+ Ajouter un invité</button>
    <table class="admin-table">
      <thead>
        <tr>
          <th>Nom</th><th>Côté</th><th>Événements</th><th>Statut RSVP</th>
          <th>Adultes</th><th>Enfants</th><th>Régime</th><th>Message</th><th>Lien</th>
        </tr>
      </thead>
      <tbody>
        ${guests.map(g => renderGuestRow(g, eventById)).join('')}
      </tbody>
    </table>
    <form id="guest-form" class="guest-form" hidden>
      <input type="hidden" id="guest-id">
      <label class="field"><span>Nom</span><input id="guest-name" required></label>
      <fieldset class="field">
        <legend>Côté</legend>
        <label><input type="radio" name="guest-side" value="marie"> Marié</label>
        <label><input type="radio" name="guest-side" value="mariee"> Mariée</label>
        <label><input type="radio" name="guest-side" value="deux" checked> Les deux</label>
      </fieldset>
      <fieldset class="field">
        <legend>Événements</legend>
        ${events.map(e => `<label><input type="checkbox" class="guest-event-cb" value="${e.id}"> ${e.title_fr}</label>`).join('')}
      </fieldset>
      <div class="form-actions">
        <button type="submit" class="btn-primary">Enregistrer</button>
        <button type="button" id="guest-cancel-btn" class="btn-secondary">Annuler</button>
      </div>
      <p id="guest-link-result" class="guest-link-result" hidden></p>
    </form>
  `;

  document.getElementById('add-guest-btn').addEventListener('click', () => openGuestForm(null, guests));
  panel.querySelectorAll('.btn-copy-link').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = `${location.origin}/?invite=${btn.dataset.token}`;
      await navigator.clipboard.writeText(url);
      btn.textContent = 'Copié !';
      setTimeout(() => { btn.textContent = 'Copier le lien'; }, 1500);
    });
  });
  document.getElementById('guest-cancel-btn').addEventListener('click', () => {
    document.getElementById('guest-form').hidden = true;
  });
  document.getElementById('guest-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('guest-name').value;
    const side = document.querySelector('input[name="guest-side"]:checked').value;
    const assignedEvents = Array.from(document.querySelectorAll('.guest-event-cb:checked')).map(cb => cb.value);
    const token = generateToken();
    await setDoc(doc(db, 'guests', token), {
      name, side, assignedEvents,
      createdAt: new Date().toISOString(),
      rsvp: { status: 'pending', name: '', adults: 0, children: 0, diet: '', message: '', confirmedEvents: {}, respondedAt: null },
    });
    const result = document.getElementById('guest-link-result');
    result.textContent = `Lien créé : ${location.origin}/?invite=${token}`;
    result.hidden = false;
    renderGuestsTab();
  });
}

function openGuestForm(id, guests) {
  const form = document.getElementById('guest-form');
  const g = id ? guests.find(x => x.id === id) : null;
  document.getElementById('guest-id').value = id || '';
  document.getElementById('guest-name').value = g ? g.name : '';
  document.querySelectorAll('input[name="guest-side"]').forEach(r => {
    r.checked = g ? r.value === g.side : r.value === 'deux';
  });
  document.querySelectorAll('.guest-event-cb').forEach(cb => {
    cb.checked = g ? (g.assignedEvents || []).includes(cb.value) : false;
  });
  document.getElementById('guest-link-result').hidden = true;
  form.hidden = false;
}
```

Note: `openGuestForm` already accepts an `id` for editing — Task 7 wires up the "Modifier" button that calls it with a real ID; this task only ever calls it with `null` (the "+ Ajouter" button), so edit isn't reachable yet, which is expected for this task's scope.

- [ ] **Step 2: Modify `admin/script.js`**

Old:
```js
import { initAuth } from './auth.js';
import { renderEventsTab } from './events.js';
```

New:
```js
import { initAuth } from './auth.js';
import { renderEventsTab } from './events.js';
import { renderGuestsTab } from './guests.js';
```

Old:
```js
initAuth({
  onSignedIn: () => { renderEventsTab(); },
  onSignedOut: () => {},
});
```

New:
```js
initAuth({
  onSignedIn: () => { renderEventsTab(); renderGuestsTab(); },
  onSignedOut: () => {},
});
```

- [ ] **Step 3: Manual verification**

1. Log into `/admin/`, "Invités" tab active by default. Expected: empty table (no guests yet), "+ Ajouter un invité" button visible.
2. Click it. Expected: form appears with Nom, Côté (radio, "Les deux" pre-checked), 4 event checkboxes (from Task 5's seed data), Enregistrer/Annuler buttons.
3. Fill Nom = "Test Guest", leave côté "Les deux", check "Mariage civil" and "Soirée", submit.
4. Expected: `guest-link-result` shows a `Lien créé : http://localhost:8743/?invite=<12-char token>` line; table now shows 1 row: Nom "Test Guest", Côté "Les deux", Événements "Mariage civil, Soirée", Statut "En attente" (grey badge), Adultes/Enfants/Régime/Message empty, a "Copier le lien" button.
5. Click "Copier le lien", then check clipboard via `mcp__Claude_Preview__preview_eval`: `navigator.clipboard.readText()` — expect it to match the URL shown in step 4.
6. Reload the page, log in again. Expected: the guest row persists (data is in Firestore, not just local state).
7. In the Firebase console, confirm a `guests` collection exists with one document whose ID is the token from the copied link, and fields match what was entered.

- [ ] **Step 4: Commit**

```bash
git add admin/guests.js admin/script.js
git commit -m "feat: add admin guests tab (list + add)"
```

---

## Task 7: Admin — Guests tab (edit + delete)

**Files:**
- Modify: `admin/guests.js`

**Interfaces:**
- Consumes: same as Task 6.
- Produces: no new exports — extends `renderGuestsTab()`'s rendered table with an Actions column.

- [ ] **Step 1: Modify `admin/guests.js` — add `updateDoc`/`deleteDoc` imports**

Old:
```js
import { collection, getDocs, doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
```

New:
```js
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
```

- [ ] **Step 2: Modify `renderGuestRow` — add Actions column**

Old:
```js
      <td>${rsvp.message ?? ''}</td>
      <td><button class="btn-copy-link" data-token="${g.id}">Copier le lien</button></td>
    </tr>`;
```

New:
```js
      <td>${rsvp.message ?? ''}</td>
      <td><button class="btn-copy-link" data-token="${g.id}">Copier le lien</button></td>
      <td>
        <button class="btn-edit-guest" data-id="${g.id}">Modifier</button>
        <button class="btn-delete-guest" data-id="${g.id}">Supprimer</button>
      </td>
    </tr>`;
```

- [ ] **Step 3: Modify the table header in `renderGuestsTab`**

Old:
```js
          <th>Adultes</th><th>Enfants</th><th>Régime</th><th>Message</th><th>Lien</th>
        </tr>
```

New:
```js
          <th>Adultes</th><th>Enfants</th><th>Régime</th><th>Message</th><th>Lien</th><th>Actions</th>
        </tr>
```

- [ ] **Step 4: Modify `renderGuestsTab` — wire edit/delete buttons**

Old:
```js
  document.getElementById('add-guest-btn').addEventListener('click', () => openGuestForm(null, guests));
  panel.querySelectorAll('.btn-copy-link').forEach(btn => {
```

New:
```js
  document.getElementById('add-guest-btn').addEventListener('click', () => openGuestForm(null, guests));
  panel.querySelectorAll('.btn-edit-guest').forEach(btn => {
    btn.addEventListener('click', () => openGuestForm(btn.dataset.id, guests));
  });
  panel.querySelectorAll('.btn-delete-guest').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cet invité ?')) return;
      await deleteDoc(doc(db, 'guests', btn.dataset.id));
      renderGuestsTab();
    });
  });
  panel.querySelectorAll('.btn-copy-link').forEach(btn => {
```

- [ ] **Step 5: Modify the submit handler to support edit (not just create)**

Old:
```js
  document.getElementById('guest-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('guest-name').value;
    const side = document.querySelector('input[name="guest-side"]:checked').value;
    const assignedEvents = Array.from(document.querySelectorAll('.guest-event-cb:checked')).map(cb => cb.value);
    const token = generateToken();
    await setDoc(doc(db, 'guests', token), {
      name, side, assignedEvents,
      createdAt: new Date().toISOString(),
      rsvp: { status: 'pending', name: '', adults: 0, children: 0, diet: '', message: '', confirmedEvents: {}, respondedAt: null },
    });
    const result = document.getElementById('guest-link-result');
    result.textContent = `Lien créé : ${location.origin}/?invite=${token}`;
    result.hidden = false;
    renderGuestsTab();
  });
```

New:
```js
  document.getElementById('guest-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('guest-id').value || null;
    const name = document.getElementById('guest-name').value;
    const side = document.querySelector('input[name="guest-side"]:checked').value;
    const assignedEvents = Array.from(document.querySelectorAll('.guest-event-cb:checked')).map(cb => cb.value);

    if (id) {
      await updateDoc(doc(db, 'guests', id), { name, side, assignedEvents });
    } else {
      const token = generateToken();
      await setDoc(doc(db, 'guests', token), {
        name, side, assignedEvents,
        createdAt: new Date().toISOString(),
        rsvp: { status: 'pending', name: '', adults: 0, children: 0, diet: '', message: '', confirmedEvents: {}, respondedAt: null },
      });
      const result = document.getElementById('guest-link-result');
      result.textContent = `Lien créé : ${location.origin}/?invite=${token}`;
      result.hidden = false;
    }
    renderGuestsTab();
  });
```

- [ ] **Step 6: Manual verification**

1. Reuse the "Test Guest" row from Task 6. Click "Modifier". Expected: form pre-filled with "Test Guest", "Les deux" checked, "Mariage civil"/"Soirée" checkboxes checked, others unchecked.
2. Change Nom to "Test Guest Modifié", uncheck "Soirée", check "Cérémonie du thé", save.
3. Expected: table updates in place — Nom shows the new name, Événements shows "Cérémonie du thé, Mariage civil". Reload + re-login: change persisted in Firestore.
4. Click "Supprimer" on the row, confirm. Expected: row disappears. Check Firebase console: `guests` collection is empty again.
5. Check console for errors — expect none.

- [ ] **Step 7: Commit**

```bash
git add admin/guests.js
git commit -m "feat: add admin guest edit and delete"
```

---

## Task 8: Guest-facing site — Firestore-backed access & dynamic events

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `script.js`

**Interfaces:**
- Consumes: `db` from `./firebase-init.js`; `guests`/`events` collections as written by Tasks 5–7.
- Produces: `state.rawEvents`, `state.assignedEventIds`, `visibleEvents()` (unchanged return shape: `{id, zh, time, title, place, desc}`, so `renderProgramme`/`renderRsvpEvents`/`renderConfirmLine` need zero changes) — used by Task 9.

- [ ] **Step 1: Modify `index.html` — add loading screen, gate the envelope, use module script**

Old:
```html
<!-- ===================== ENVELOPE INTRO ===================== -->
<div id="envelope-overlay" class="envelope-overlay">
```

New:
```html
<!-- ===================== LOADING ===================== -->
<div id="loading-screen" class="loading-screen">
  <div class="cal loading-glyph">囍</div>
</div>

<!-- ===================== ENVELOPE INTRO ===================== -->
<div id="envelope-overlay" class="envelope-overlay" hidden>
```

Old (bottom of file):
```html
<script src="script.js"></script>
```

New:
```html
<script type="module" src="script.js"></script>
```

- [ ] **Step 2: Modify `styles.css` — add loading screen styles**

Old:
```css
.envelope-overlay{
```

New:
```css
.loading-screen{position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;background:#6E1A1A;color:#E7D6AE}
.loading-glyph{font-size:64px;animation:fadeIn 1s both}

.envelope-overlay{
```

- [ ] **Step 3: Modify `script.js` — remove IIFE wrapper and `INVITES`, add imports**

Old (lines 1–9):
```js
(() => {
  const INVITES = {
    'FAMILLE':  { group: 'complet' },
    'SOPHIE27': { group: 'complet' },
    'THE2027':  { group: 'complet' },
    'AMIS':     { group: 'mairie_soiree' },
    'LOGNES':   { group: 'mairie_soiree' },
    'SOIREE77': { group: 'mairie_soiree' },
  };
```

New:
```js
import { db } from './firebase-init.js';
import { doc, getDoc, getDocs, collection, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
```

- [ ] **Step 4: Modify `script.js` — remove the hardcoded `EVENTS` const**

Old (lines 80–93, the whole `const EVENTS = { ... };` block) — delete it entirely. `HOTELS` and `PLACES` immediately below stay untouched.

- [ ] **Step 5: Modify `script.js` — extend `state`**

Old:
```js
  const state = {
    lang: 'fr',
    access: 'public',
    env: 'sealed',
    menuOpen: false,
    submitted: false,
    rsvp: { name: '', adults: 1, children: 0, events: {}, diet: '', message: '' },
    cd: { d: 0, h: 0, m: 0, s: 0, passed: false },
  };
```

New:
```js
  const state = {
    lang: 'fr',
    access: 'public',
    env: 'sealed',
    menuOpen: false,
    submitted: false,
    dataReady: false,
    guestToken: null,
    rawEvents: [],
    assignedEventIds: [],
    rsvp: { name: '', adults: 1, children: 0, events: {}, diet: '', message: '' },
    cd: { d: 0, h: 0, m: 0, s: 0, passed: false },
  };
```

- [ ] **Step 6: Modify `script.js` — replace `resolveAccess`/`visibleEvents` with Firestore-backed versions**

Old:
```js
  function resolveAccess() {
    let code = '';
    try { code = (new URLSearchParams(window.location.search).get('invite') || '').trim().toUpperCase(); } catch (e) {}
    const rec = INVITES[code];
    return rec ? rec.group : 'public';
  }

  function visibleEvents() {
    const all = EVENTS[state.lang];
    return all.filter(e => state.access === 'complet' ? true : e.access === 'all');
  }
```

New:
```js
  function localizeEvent(raw, lang) {
    return {
      id: raw.id,
      zh: raw.zh,
      time: lang === 'zh' ? raw.time_zh : raw.time_fr,
      title: lang === 'zh' ? raw.title_zh : raw.title_fr,
      place: lang === 'zh' ? raw.place_zh : raw.place_fr,
      desc: lang === 'zh' ? raw.desc_zh : raw.desc_fr,
    };
  }

  function visibleEvents() {
    return state.rawEvents
      .filter(e => state.assignedEventIds.includes(e.id))
      .sort((a, b) => a.order - b.order)
      .map(e => localizeEvent(e, state.lang));
  }

  async function loadGuestData() {
    let token = '';
    try { token = (new URLSearchParams(window.location.search).get('invite') || '').trim(); } catch (e) {}
    if (!token) { state.access = 'public'; return; }

    try {
      const guestSnap = await getDoc(doc(db, 'guests', token));
      if (!guestSnap.exists()) { state.access = 'public'; return; }
      const guest = guestSnap.data();
      const eventsSnap = await getDocs(collection(db, 'events'));
      state.access = 'guest';
      state.guestToken = token;
      state.assignedEventIds = guest.assignedEvents || [];
      state.rawEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (guest.rsvp && guest.rsvp.status === 'confirmed') {
        state.submitted = true;
        state.rsvp = {
          name: guest.rsvp.name || '',
          adults: guest.rsvp.adults ?? 1,
          children: guest.rsvp.children ?? 0,
          diet: guest.rsvp.diet || '',
          message: guest.rsvp.message || '',
          events: guest.rsvp.confirmedEvents || {},
        };
      }
    } catch (e) {
      console.error('Guest lookup failed', e);
      state.access = 'public';
    }
  }
```

- [ ] **Step 7: Modify `script.js` — gate the envelope click, add loading/reveal helpers**

Old:
```js
  // ---- Envelope ----
  const envOverlay = document.getElementById('envelope-overlay');
  envOverlay.addEventListener('click', () => {
    if (state.env !== 'sealed') return;
```

New:
```js
  // ---- Envelope ----
  const envOverlay = document.getElementById('envelope-overlay');
  envOverlay.addEventListener('click', () => {
    if (!state.dataReady || state.env !== 'sealed') return;
```

Add these two new functions right after `renderEnvelope()` (which stays unchanged):

```js
  function showLoading(show) {
    document.getElementById('loading-screen').hidden = !show;
  }

  function revealEnvelope() {
    document.getElementById('envelope-overlay').hidden = false;
  }
```

- [ ] **Step 8: Modify `script.js` — rewrite `init()`, drop the IIFE close**

Old:
```js
  function init() {
    state.access = resolveAccess();
    let opened = false;
    try { opened = sessionStorage.getItem('sr_env_opened') === '1'; } catch (e) {}
    state.env = opened ? 'done' : 'sealed';
    renderEnvelope();
    syncScroll();
    fullRender();
    tick();
    setInterval(tick, 1000);
  }

  init();
})();
```

New:
```js
  async function init() {
    showLoading(true);
    await loadGuestData();
    state.dataReady = true;
    showLoading(false);

    let opened = false;
    try { opened = sessionStorage.getItem('sr_env_opened') === '1'; } catch (e) {}
    state.env = opened ? 'done' : 'sealed';
    revealEnvelope();
    renderEnvelope();
    syncScroll();
    fullRender();
    tick();
    setInterval(tick, 1000);
  }

  init();
```

- [ ] **Step 9: Manual verification**

Use a guest token created in Task 6/7 (e.g. re-create "Test Guest" with 2 events checked if it was deleted).

1. Visit `/` with no `?invite=`. Expected: brief/no loading flash, then envelope (sealed), click it → opens → reveals public teaser (unchanged from before). Check console: no errors.
2. Visit `/?invite=bogus-token`. Expected: same as no-token case — public teaser, not a broken page.
3. Visit `/?invite=<real token>`. Expected: loading screen (bordeaux, pulsing 囍) appears briefly, then the sealed envelope. Click it → opens → reveals the full guest site.
4. Scroll to Programme section. Expected: only the events checked for this guest in the admin form appear (e.g. 2 of the 4), with titles/times/places matching what's in Firestore (edit one in the admin Events tab first, reload the guest link, confirm the change shows up here — proves it's live data, not hardcoded).
5. Scroll to RSVP section. Expected: same filtered event list appears as checkboxes.
6. Toggle language (FR ↔ 中文). Expected: event titles/times/places switch language correctly (pulling `_fr`/`_zh` fields).
7. Check `mcp__Claude_Preview__preview_network` — confirm Firestore requests succeed (no 403/permission-denied).

- [ ] **Step 10: Commit**

```bash
git add index.html styles.css script.js
git commit -m "feat: guest site reads access and events from Firestore"
```

---

## Task 9: Guest-facing site — RSVP write-back

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `script.js`

**Interfaces:**
- Consumes: `db`, `doc`, `updateDoc` (already imported in Task 8).
- Produces: writes to `guests/<token>.rsvp` matching the shape Task 6/7's admin table reads.

- [ ] **Step 1: Modify `index.html` — remove the now-obsolete demo note**

Old:
```html
        <p class="rsvp-demo-note" data-i18n="demoNote"></p>
```

New: delete that line entirely.

- [ ] **Step 2: Modify `styles.css` — remove the unused rule**

Old:
```css
.rsvp-demo-note{color:var(--pink);font-size:14px;line-height:1.6}
```

New: delete that line entirely.

- [ ] **Step 3: Modify `script.js` — remove `demoNote` from both language objects**

Old (in `T.fr`):
```js
      demoNote: "(Démonstration — aucun envoi réel n'est effectué. À connecter à votre outil de suivi.)",
```

New: delete that line.

Old (in `T.zh`):
```js
      demoNote: '（演示 — 不会实际发送，请连接您的统计工具。）',
```

New: delete that line.

- [ ] **Step 4: Modify `script.js` — write RSVP to Firestore on submit**

Old:
```js
  rsvpForm.addEventListener('submit', e => {
    e.preventDefault();
    state.submitted = true;
    renderConfirmLine();
    renderRsvpFormState();
  });
```

New:
```js
  rsvpForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!state.guestToken) return;
    const confirmedEvents = { ...state.rsvp.events };
    try {
      await updateDoc(doc(db, 'guests', state.guestToken), {
        rsvp: {
          status: 'confirmed',
          name: state.rsvp.name,
          adults: Number(state.rsvp.adults) || 0,
          children: Number(state.rsvp.children) || 0,
          diet: state.rsvp.diet,
          message: state.rsvp.message,
          confirmedEvents,
          respondedAt: new Date().toISOString(),
        },
      });
      state.submitted = true;
      renderConfirmLine();
      renderRsvpFormState();
    } catch (err) {
      console.error('RSVP submit failed', err);
      alert("La réponse n'a pas pu être envoyée. Vérifiez votre connexion et réessayez.");
    }
  });
```

(The "modifier ma réponse" reset handler stays exactly as-is — it only resets local form state so the guest can re-fill and re-submit; nothing is written to Firestore until they submit again.)

- [ ] **Step 5: Manual verification**

1. Open the site with a real guest token (2 assigned events), open the envelope, scroll to RSVP.
2. Fill Nom = "Vérif E2E", Adultes = 2, Enfants = 1, check one of the two events, fill Régime = "Sans gluten", Message = "Hâte d'y être", submit.
3. Expected: thank-you view appears listing the one checked event, demo-note paragraph is gone.
4. In `/admin/`, "Invités" tab, find this guest's row. Expected: Statut RSVP = "Confirmé" (green badge), Adultes = 2, Enfants = 1, Régime = "Sans gluten", Message = "Hâte d'y être".
5. Reload the guest's `/?invite=<token>` link fresh (new tab / cleared sessionStorage). Expected: after opening the envelope, the RSVP section shows the thank-you view directly (not the blank form) — proves `loadGuestData` correctly rehydrates `state.submitted`/`state.rsvp` from the already-confirmed Firestore doc.
6. **Security check** — in the browser console (`mcp__Claude_Preview__preview_eval`), attempt an unauthorized write as an anonymous client:

```js
import('./firebase-init.js').then(async ({ db }) => {
  const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  try {
    await updateDoc(doc(db, 'guests', '<the same token>'), { assignedEvents: ['soiree'] });
    console.log('SECURITY BUG: write succeeded');
  } catch (e) {
    console.log('Correctly blocked:', e.code);
  }
});
```

Expected: `Correctly blocked: permission-denied` (because the write touches `assignedEvents`, not just `rsvp`).

7. Also confirm an anonymous client can't list all guests:

```js
import('./firebase-init.js').then(async ({ db }) => {
  const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  try {
    const snap = await getDocs(collection(db, 'guests'));
    console.log('SECURITY BUG: list succeeded, size', snap.size);
  } catch (e) {
    console.log('Correctly blocked:', e.code);
  }
});
```

Expected: `Correctly blocked: permission-denied`.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css script.js
git commit -m "feat: RSVP submissions write to Firestore, drop demo-mode copy"
```

---

## Task 10: End-to-end verification & cleanup

**Files:** none (verification only, plus a final commit if any fixes are needed)

- [ ] **Step 1: Full guest journey (public)**
  - `/` with no invite param → teaser only, no console errors, no Firestore reads triggered (check Network tab).

- [ ] **Step 2: Full guest journey (invited)**
  - Admin creates a fresh guest with all 4 events assigned.
  - Visit their link → loading → envelope → full site with all 4 Programme entries and RSVP checkboxes.
  - Submit RSVP with 2 of 4 events checked → thank-you view lists exactly those 2.
  - Admin table shows "Confirmé" with correct counts for that guest.

- [ ] **Step 3: Full admin journey**
  - Log in, log out, wrong-password error.
  - Add, edit, delete an event; confirm guest site reflects edits after a reload.
  - Add, edit, delete a guest; confirm link copy works and Firestore state matches the UI at every step.

- [ ] **Step 4: Security rules**
  - Re-run both negative checks from Task 9 Step 5.6/5.7 against a *different* guest token to confirm it's not a fluke.
  - Confirm `events` collection is publicly readable (guest site already proves this) but not publicly writable (attempt an anonymous `updateDoc` on an event doc, expect `permission-denied`).

- [ ] **Step 5: Regression check on untouched sections**
  - Confirm hero, histoire, infos pratiques, hébergement, cadeau, dress code, galerie, footer, and the language toggle all still render and behave exactly as before this feature (no visual or functional regressions from the Firestore changes).

- [ ] **Step 6: Fix anything found, then final commit**

If Steps 1–5 are all clean, nothing to commit. If any fix was needed:

```bash
git add -A
git commit -m "fix: address issues found in end-to-end verification"
```

---

## Self-Review Notes (for whoever executes this plan)

- Spec coverage: data model (Task 1, 6, 7), auth/rules (Task 1–3), admin guests+events CRUD (Task 3–7), guest-site token lookup + dynamic events (Task 8), RSVP write-back (Task 9), setup/error-handling/testing (Task 1–2, all manual-verification steps) — all spec sections have a corresponding task.
- `visibleEvents()`'s return shape (`{id, zh, time, title, place, desc}`) is unchanged from the pre-Firestore version specifically so `renderProgramme`, `renderRsvpEvents`, and `renderConfirmLine` require zero edits in Task 8 — verified by re-reading those three functions against the new shape.
- Guest doc field names are consistent everywhere they're touched: `assignedEvents`, `side`, `rsvp.confirmedEvents`, `rsvp.status` match across `admin/guests.js` (writer) and `script.js` (reader/writer).
