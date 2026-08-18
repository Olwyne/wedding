# Email Campaigns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual email sending (relance, rappel J, création de compte) via a Vercel serverless function backed by Resend.

**Architecture:** Vercel function `/api/send-email.js` receives `{type, recipients[]}` with a Firebase ID token in `Authorization: Bearer`, verifies the token with firebase-admin, builds FR+ZH HTML, sends via Resend. Admin UI wires bulk + per-row send buttons in `guests.js` and auto-send on creation in `users.js`.

**Tech Stack:** Vanilla JS ES modules, Firebase Auth (ID tokens), firebase-admin (Node.js in Vercel function), Resend SDK, Vercel serverless functions

## Global Constraints

- No build step — browser files are plain ES modules, changes take effect on reload
- No TypeScript — plain JS only
- `escapeHtml()` must be used for all user content interpolated into HTML
- Guest invitation link format: `https://<origin>/?invite=<token>` (token = guest doc ID)
- Firebase project ID: `wedding-39dcc`
- Wedding date: 24 juillet 2027
- Vercel function runtime: Node.js (default)
- `RESEND_API_KEY` and `FIREBASE_SERVICE_ACCOUNT` must never appear in committed code

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `api/package.json` | Create | npm deps for Vercel function (firebase-admin, resend) |
| `api/send-email.js` | Create | Vercel function: auth verification, HTML build, Resend call |
| `admin/email.js` | Create | Client-side helper: `sendEmailWithConfirm(type, recipients, eventById)` — confirmation modal + fetch |
| `admin/guests.js` | Modify | Bulk send buttons in filter bar + ✉ icon in action menu |
| `admin/users.js` | Modify | Auto-send `account` email on creation + "Renvoyer les accès" per row |

---

### Task 1: Vercel function — scaffold + Resend integration

**Files:**
- Create: `api/package.json`
- Create: `api/send-email.js`

**Interfaces:**
- Produces: `POST /api/send-email` accepting `{ type: 'relance'|'rappel'|'account', recipients: Array<{name, email, token?, events?, password?, login_url?}>, origin: string }` with `Authorization: Bearer <idToken>` header
- Returns: `{ sent: number, failed: Array<{email, error}> }`

- [ ] **Step 1: Create `api/package.json`**

```json
{
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "resend": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `api/send-email.js` skeleton with Resend integration (no auth yet)**

```js
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function buildSubject(type) {
  if (type === 'relance') return 'Sophie & Sob – Nous attendons votre réponse 💌';
  if (type === 'rappel') return 'Sophie & Sob – On se retrouve bientôt ! 🎉';
  if (type === 'account') return 'Accès admin – Site de mariage Sophie & Sob';
  throw new Error(`Unknown type: ${type}`);
}

function buildHtml(type, recipient) {
  if (type === 'relance') return buildRelanceHtml(recipient);
  if (type === 'rappel') return buildRappelHtml(recipient);
  if (type === 'account') return buildAccountHtml(recipient);
  throw new Error(`Unknown type: ${type}`);
}

function baseStyle() {
  return `
    <style>
      body { font-family: Georgia, serif; background: #f9f6f1; margin: 0; padding: 0; }
      .wrap { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; }
      .header { background: #2F5FB0; padding: 32px 40px; text-align: center; }
      .header h1 { color: #fff; font-size: 22px; margin: 0; letter-spacing: 2px; }
      .body { padding: 40px; color: #333; line-height: 1.7; }
      .divider { border: none; border-top: 1px solid #e8e0d5; margin: 32px 0; }
      .btn { display: inline-block; background: #2F5FB0; color: #fff !important; text-decoration: none;
             padding: 14px 32px; border-radius: 6px; font-size: 15px; margin: 24px 0; }
      .footer { padding: 20px 40px; font-size: 12px; color: #999; text-align: center; }
      .zh { color: #555; font-size: 15px; }
    </style>`;
}

function buildRelanceHtml({ name, token, origin }) {
  const link = `${origin}/?invite=${token}`;
  return `<!DOCTYPE html><html><head>${baseStyle()}</head><body>
    <div class="wrap">
      <div class="header"><h1>Sophie &amp; Sob</h1></div>
      <div class="body">
        <p>Bonjour ${name},</p>
        <p>Nous organisons notre mariage et nous n'avons pas encore reçu votre réponse.
        Nous serions ravis de vous compter parmi nous !</p>
        <p>Merci de confirmer votre présence via le lien ci-dessous :</p>
        <a class="btn" href="${link}">Confirmer ma présence</a>
        <hr class="divider">
        <p class="zh">亲爱的 ${name}，</p>
        <p class="zh">我们正在筹备婚礼，但还未收到您的回复。我们非常期待您的到来！</p>
        <p class="zh">请点击以下链接确认您是否出席：</p>
        <a class="btn" href="${link}">确认出席</a>
      </div>
      <div class="footer">Sophie &amp; Sob · 24 juillet 2027</div>
    </div>
  </body></html>`;
}

function buildRappelHtml({ name, events }) {
  const eventList = Array.isArray(events) && events.length
    ? `<ul>${events.map(e => `<li>${e}</li>`).join('')}</ul>`
    : '';
  const eventListZh = eventList;
  return `<!DOCTYPE html><html><head>${baseStyle()}</head><body>
    <div class="wrap">
      <div class="header"><h1>Sophie &amp; Sob</h1></div>
      <div class="body">
        <p>Bonjour ${name},</p>
        <p>Le grand jour approche ! Nous avons hâte de vous retrouver pour célébrer avec vous.</p>
        <p><strong>Date :</strong> 24 juillet 2027</p>
        ${eventList ? `<p><strong>Vos événements :</strong></p>${eventList}` : ''}
        <p>Pour toute question, répondez directement à cet email.</p>
        <hr class="divider">
        <p class="zh">亲爱的 ${name}，</p>
        <p class="zh">婚礼的日子快到了！我们非常期待与您共同庆祝这一美好时刻。</p>
        <p class="zh"><strong>日期：</strong>2027年7月24日</p>
        ${eventListZh ? `<p class="zh"><strong>您的活动：</strong></p>${eventListZh}` : ''}
        <p class="zh">如有任何问题，请直接回复此邮件。</p>
      </div>
      <div class="footer">Sophie &amp; Sob · 24 juillet 2027</div>
    </div>
  </body></html>`;
}

function buildAccountHtml({ email, password, login_url }) {
  return `<!DOCTYPE html><html><head>${baseStyle()}</head><body>
    <div class="wrap">
      <div class="header"><h1>Site de mariage – Accès admin</h1></div>
      <div class="body">
        <p>Un compte administrateur a été créé pour vous.</p>
        <p><strong>Email :</strong> ${email}<br>
           <strong>Mot de passe temporaire :</strong> <code>${password}</code></p>
        <p>Connectez-vous via le lien ci-dessous. Changez votre mot de passe après la première connexion.</p>
        <a class="btn" href="${login_url}">Accéder au site</a>
      </div>
      <div class="footer">Sophie &amp; Sob</div>
    </div>
  </body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, recipients, origin } = req.body;
  if (!type || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'Missing type or recipients' });
  }

  const subject = buildSubject(type);
  const sent = [];
  const failed = [];

  for (const recipient of recipients) {
    if (!recipient.email) { failed.push({ email: '(none)', error: 'no email' }); continue; }
    try {
      await resend.emails.send({
        from: 'Sophie & Sob <mariage@VOTRE_DOMAINE_VERIFIE_RESEND>',  // remplacer par le domaine vérifié dans Resend
        to: recipient.email,
        subject,
        html: buildHtml(type, { ...recipient, origin: origin || 'https://sophieandsob.com' }),
      });
      sent.push(recipient.email);
    } catch (err) {
      failed.push({ email: recipient.email, error: err.message });
    }
    if (recipients.length > 1) await new Promise(r => setTimeout(r, 100));
  }

  res.status(200).json({ sent: sent.length, failed });
}
```

- [ ] **Step 3: Add `RESEND_API_KEY` to Vercel env**

```bash
vercel env add RESEND_API_KEY
```

Paste the Resend API key when prompted. Select all environments (Production, Preview, Development).

- [ ] **Step 4: Smoke test with curl (no auth yet)**

Deploy or run locally:
```bash
vercel dev
```

```bash
curl -s -X POST http://localhost:3000/api/send-email \
  -H "Content-Type: application/json" \
  -d '{"type":"relance","recipients":[{"name":"Test","email":"sophbyr@gmail.com","token":"abc123"}],"origin":"http://localhost:3000"}' | jq
```

Expected: `{"sent":1,"failed":[]}` and an email arrives at `sophbyr@gmail.com`.

- [ ] **Step 5: Commit**

```bash
rtk git add api/package.json api/send-email.js && rtk git commit -m "feat: add Vercel send-email function with Resend integration"
```

---

### Task 2: Firebase token verification

**Files:**
- Modify: `api/send-email.js`

**Interfaces:**
- Consumes: `Authorization: Bearer <firebaseIdToken>` header
- Produces: 401 if token invalid/missing; continues to send if valid

- [ ] **Step 1: Download Firebase service account**

Firebase Console → Project settings → Service accounts → Generate new private key → download JSON.

- [ ] **Step 2: Add `FIREBASE_SERVICE_ACCOUNT` to Vercel env**

```bash
cat /path/to/serviceAccount.json | vercel env add FIREBASE_SERVICE_ACCOUNT
```

Or paste the JSON string manually in Vercel dashboard → Settings → Environment Variables.

- [ ] **Step 3: Add token verification to `api/send-email.js`**

At the top, replace the existing imports and add admin init:

```js
import { Resend } from 'resend';
import admin from 'firebase-admin';

const resend = new Resend(process.env.RESEND_API_KEY);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

async function verifyToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new Error('No token');
  await admin.auth().verifyIdToken(token);
}
```

In the `handler` function, add verification before processing:

```js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await verifyToken(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ... rest of handler unchanged
```

- [ ] **Step 4: Test auth rejection**

```bash
curl -s -X POST http://localhost:3000/api/send-email \
  -H "Content-Type: application/json" \
  -d '{"type":"relance","recipients":[{"name":"Test","email":"test@test.com","token":"x"}]}' | jq
```

Expected: `{"error":"Unauthorized"}`

- [ ] **Step 5: Test with valid token**

In browser console while logged in to admin:
```js
copy(await firebase.auth().currentUser.getIdToken())
```

```bash
curl -s -X POST http://localhost:3000/api/send-email \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <paste-token>" \
  -d '{"type":"relance","recipients":[{"name":"Test","email":"sophbyr@gmail.com","token":"abc123"}],"origin":"http://localhost:3000"}' | jq
```

Expected: `{"sent":1,"failed":[]}`

- [ ] **Step 6: Commit**

```bash
rtk git add api/send-email.js && rtk git commit -m "feat: add Firebase ID token verification to send-email function"
```

---

### Task 3: Client-side email helper + confirmation modal

**Files:**
- Create: `admin/email.js`

**Interfaces:**
- Produces: `sendEmailWithConfirm(type, recipients, eventById?)` — async function; shows modal, sends on confirm, returns `{sent, failed}`
- `recipients` shape: `Array<{name: string, email: string, token?: string, events?: string[]}>`
- `type`: `'relance' | 'rappel' | 'account'`

- [ ] **Step 1: Create `admin/email.js`**

```js
// admin/email.js
import { auth } from '../firebase-init.js';

const TYPE_LABELS = {
  relance: 'relance',
  rappel: 'rappel J',
  account: 'accès admin',
};

const TYPE_SUBJECTS = {
  relance: 'Sophie & Sob – Nous attendons votre réponse 💌',
  rappel: 'Sophie & Sob – On se retrouve bientôt ! 🎉',
  account: 'Accès admin – Site de mariage Sophie & Sob',
};

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function buildRecipientList(recipients) {
  if (recipients.length === 1) {
    const r = recipients[0];
    return `<p><strong>${escapeHtml(r.name)}</strong> (${escapeHtml(r.email)})</p>`;
  }
  const items = recipients
    .slice(0, 20)
    .map(r => `<li>${escapeHtml(r.name)} (${escapeHtml(r.email)})</li>`)
    .join('');
  const more = recipients.length > 20
    ? `<li style="color:var(--muted)">… et ${recipients.length - 20} autres</li>`
    : '';
  return `<ul style="max-height:200px;overflow-y:auto;margin:8px 0;padding-left:20px">${items}${more}</ul>`;
}

async function doSend(type, recipients) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch('/api/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ type, recipients, origin: location.origin }),
  });
  if (res.status === 401) throw new Error('Session expirée, rechargez la page.');
  if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);
  return res.json();
}

export function sendEmailWithConfirm(type, recipients) {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    const modal = document.createElement('div');
    modal.className = 'panel';
    modal.style.maxWidth = '480px';

    const label = TYPE_LABELS[type] || type;
    const subject = TYPE_SUBJECTS[type] || '';
    const count = recipients.length;
    const title = count === 1
      ? `Envoyer un email de ${label} à :`
      : `Envoyer un email de ${label} à ${count} invités :`;

    modal.innerHTML = `
      <div class="panel-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="btn-icon" id="email-modal-close">✕</button>
      </div>
      <div class="panel-body">
        ${buildRecipientList(recipients)}
        ${subject ? `<p style="color:var(--muted);font-size:13px">Sujet : <em>${escapeHtml(subject)}</em></p>` : ''}
        <p id="email-modal-result" style="display:none"></p>
      </div>
      <div class="panel-footer">
        <button class="btn-primary" id="email-modal-send">Envoyer${count > 1 ? ' à tous' : ''}</button>
        <button class="btn-secondary" id="email-modal-cancel">Annuler</button>
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    function close(result) {
      overlay.remove();
      modal.remove();
      if (result !== undefined) resolve(result);
      else reject(new Error('cancelled'));
    }

    modal.querySelector('#email-modal-close').addEventListener('click', () => close());
    modal.querySelector('#email-modal-cancel').addEventListener('click', () => close());
    overlay.addEventListener('click', () => close());

    modal.querySelector('#email-modal-send').addEventListener('click', async () => {
      const sendBtn = modal.querySelector('#email-modal-send');
      const cancelBtn = modal.querySelector('#email-modal-cancel');
      const resultEl = modal.querySelector('#email-modal-result');

      sendBtn.disabled = true;
      cancelBtn.disabled = true;
      sendBtn.textContent = 'Envoi…';
      resultEl.style.display = 'none';

      try {
        const result = await doSend(type, recipients);
        const failText = result.failed.length
          ? ` · ${result.failed.length} échec(s)`
          : '';
        resultEl.textContent = `✓ ${result.sent} email(s) envoyé(s)${failText}`;
        resultEl.style.color = result.failed.length ? 'var(--warning, orange)' : 'var(--success, green)';
        resultEl.style.display = 'block';
        sendBtn.textContent = 'Fermer';
        sendBtn.disabled = false;
        cancelBtn.style.display = 'none';
        sendBtn.onclick = () => close(result);
      } catch (err) {
        resultEl.textContent = `Erreur : ${err.message}`;
        resultEl.style.color = 'var(--danger)';
        resultEl.style.display = 'block';
        sendBtn.textContent = 'Envoyer';
        sendBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });
  });
}
```

- [ ] **Step 2: Manual smoke test**

In the browser console on the admin page (while logged in):
```js
import('/admin/email.js').then(m =>
  m.sendEmailWithConfirm('relance', [{ name: 'Test', email: 'sophbyr@gmail.com', token: 'abc' }])
).then(console.log).catch(console.error)
```

Modal should appear. Click Envoyer → spinner → success message → email arrives.

- [ ] **Step 3: Commit**

```bash
rtk git add admin/email.js && rtk git commit -m "feat: add email confirmation modal helper"
```

---

### Task 4: Guests tab — relance & rappel buttons

**Files:**
- Modify: `admin/guests.js`

**Interfaces:**
- Consumes: `sendEmailWithConfirm(type, recipients)` from `admin/email.js`
- Consumes: `auth` from `../firebase-init.js`

- [ ] **Step 1: Add import at top of `admin/guests.js`**

After the existing imports, add:
```js
import { sendEmailWithConfirm } from './email.js';
import { auth } from '../firebase-init.js';
```

- [ ] **Step 2: Add `renderEmailBulkButton` helper**

After `renderGuestFilters`, add:

```js
function renderEmailBulkButton(type, guests) {
  const eligible = guests.filter(g => guestStatus(g) === (type === 'relance' ? 'pending' : 'confirmed') && g.email);
  if (eligible.length === 0) return '';
  const label = type === 'relance'
    ? `📧 Relancer tous (${eligible.length})`
    : `📧 Rappel J à tous (${eligible.length})`;
  return `<button class="btn-secondary" id="bulk-email-btn" data-email-type="${type}">${label}</button>`;
}
```

- [ ] **Step 3: Add bulk button to filter bar HTML**

In `renderGuestFilters`, replace:
```js
function renderGuestFilters(events) {
  return `
    <div class="guest-filters">
      <div class="filter-group">
        <button class="filter-pill ${eventFilters.size === 0 ? 'filter-pill-active' : ''}" data-event-filter="__all__">Tous les événements</button>
        ${events.map(e => `<button class="filter-pill ${eventFilters.has(e.id) ? 'filter-pill-active' : ''}" data-event-filter="${escapeHtml(e.id)}">${escapeHtml(e.title_fr)}</button>`).join('')}
      </div>
      <div class="filter-group">
        ${STATUS_FILTERS.map(([id, label]) => `<button class="filter-pill ${statusFilter === id ? 'filter-pill-active' : ''}" data-status-filter="${id}">${label}</button>`).join('')}
      </div>
    </div>`;
}
```

With:
```js
function renderGuestFilters(events, allGuests) {
  let bulkBtn = '';
  if (statusFilter === 'pending') bulkBtn = renderEmailBulkButton('relance', allGuests);
  else if (statusFilter === 'confirmed') bulkBtn = renderEmailBulkButton('rappel', allGuests);
  return `
    <div class="guest-filters">
      <div class="filter-group">
        <button class="filter-pill ${eventFilters.size === 0 ? 'filter-pill-active' : ''}" data-event-filter="__all__">Tous les événements</button>
        ${events.map(e => `<button class="filter-pill ${eventFilters.has(e.id) ? 'filter-pill-active' : ''}" data-event-filter="${escapeHtml(e.id)}">${escapeHtml(e.title_fr)}</button>`).join('')}
      </div>
      <div class="filter-group">
        ${STATUS_FILTERS.map(([id, label]) => `<button class="filter-pill ${statusFilter === id ? 'filter-pill-active' : ''}" data-status-filter="${id}">${label}</button>`).join('')}
        ${bulkBtn}
      </div>
    </div>`;
}
```

- [ ] **Step 4: Thread `guests` into `renderGuestFilters` call in `renderGuestsTab`**

In `renderGuestsTab`, find:
```js
panel.innerHTML = `
    ${renderGuestFilters(events)}
```

Replace with:
```js
panel.innerHTML = `
    ${renderGuestFilters(events, guests)}
```

- [ ] **Step 5: Add ✉ item to action menu for guests with email**

In `renderActionsCell`, replace:
```js
const items = editable
    ? [
        { action: 'view-rsvp', label: 'Réponse' },
        { action: 'edit-guest', label: 'Modifier' },
        { action: 'delete-guest', label: 'Supprimer', danger: true },
      ]
    : [{ action: 'view-rsvp', label: 'Réponse' }];
```

With:
```js
function renderActionsCell(g, editable) {
  const status = guestStatus(g);
  const emailActions = g.email && (status === 'pending' || status === 'confirmed')
    ? [{ action: 'send-email', label: status === 'pending' ? '✉ Relancer' : '✉ Rappel J' }]
    : [];
  const items = editable
    ? [
        { action: 'view-rsvp', label: 'Réponse' },
        ...emailActions,
        { action: 'edit-guest', label: 'Modifier' },
        { action: 'delete-guest', label: 'Supprimer', danger: true },
      ]
    : [
        { action: 'view-rsvp', label: 'Réponse' },
        ...emailActions,
      ];
```

Note: remove the `function renderActionsCell(g, editable) {` line that was already there — this replaces the entire function.

- [ ] **Step 6: Wire bulk button and row send-email action in `renderGuestsTab`**

After the existing `panel.querySelectorAll('.action-menu-item').forEach(...)` block (inside `renderGuestsTab`), add:

```js
  // Bulk email button
  const bulkEmailBtn = panel.querySelector('#bulk-email-btn');
  if (bulkEmailBtn) {
    bulkEmailBtn.addEventListener('click', async () => {
      const type = bulkEmailBtn.dataset.emailType;
      const targetStatus = type === 'relance' ? 'pending' : 'confirmed';
      const recipients = guests
        .filter(g => guestStatus(g) === targetStatus && g.email)
        .map(g => ({
          name: g.name,
          email: g.email,
          token: g.id,
          events: Object.keys(g.rsvp?.confirmedEvents || {})
            .filter(id => g.rsvp.confirmedEvents[id])
            .map(id => eventById[id]?.title_fr || id),
        }));
      try {
        await sendEmailWithConfirm(type, recipients);
      } catch { /* cancelled */ }
    });
  }
```

And inside the existing `panel.querySelectorAll('.action-menu-item').forEach(btn => { ... })` block, add a new `else if` after `'delete-guest'`:

```js
      } else if (action === 'send-email') {
        const g = guests.find(g => g.id === guestId);
        if (!g?.email) return;
        const status = guestStatus(g);
        const type = status === 'pending' ? 'relance' : 'rappel';
        const recipient = {
          name: g.name,
          email: g.email,
          token: g.id,
          events: Object.keys(g.rsvp?.confirmedEvents || {})
            .filter(id => g.rsvp.confirmedEvents[id])
            .map(id => eventById[id]?.title_fr || id),
        };
        try {
          await sendEmailWithConfirm(type, [recipient]);
        } catch { /* cancelled */ }
      }
```

- [ ] **Step 7: Manual smoke test**

1. Open admin → Invités
2. Filter "En attente" → bulk button "📧 Relancer tous (N)" appears
3. Click → modal lists N recipients → click Envoyer → email arrives at test address
4. Filter "Confirmés" → bulk button "📧 Rappel J à tous (N)" appears
5. On a guest row with email → action menu → "✉ Relancer" or "✉ Rappel J" → modal → send

- [ ] **Step 8: Commit**

```bash
rtk git add admin/guests.js && rtk git commit -m "feat: add relance and rappel J email actions to guests tab"
```

---

### Task 5: Users tab — account email on creation + resend

**Files:**
- Modify: `admin/users.js`

**Interfaces:**
- Consumes: `sendEmailWithConfirm` from `./email.js`
- Consumes: `admin.auth().updateUser(uid, {password})` via Vercel function new endpoint action

**Note on "Renvoyer les accès":** the password is not stored anywhere, so resend = generate new password + reset via Firebase Admin (in the Vercel function) + send email. Add `action: 'reset-password'` support to `api/send-email.js` first.

- [ ] **Step 1: Add `reset-password` action to `api/send-email.js`**

In the `handler` function in `api/send-email.js`, before the Resend loop, add a branch:

```js
  // Password reset for admin resend-accès
  if (type === 'account' && req.body.resetUid) {
    const newPassword = generatePassword();
    await admin.auth().updateUser(req.body.resetUid, { password: newPassword });
    // Re-build recipients with new password
    recipients[0].password = newPassword;
  }
```

Add the `generatePassword` function at the top of the file (after imports). Use Node.js `crypto` for secure randomness:

```js
import crypto from 'crypto';

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}
```

- [ ] **Step 2: Add import to `admin/users.js`**

After existing imports, add:
```js
import { sendEmailWithConfirm } from './email.js';
```

- [ ] **Step 3: Auto-send account email after user creation**

In the `openUserPanel` save handler, after the successful `setDoc` calls for a new user, add:

Find:
```js
      close();
    } catch (err) {
```

Replace with:
```js
      // Send account creation email (non-blocking — user is created regardless)
      if (isNew) {
        const loginUrl = `${location.origin}/admin/`;
        fetch('/api/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await auth.currentUser.getIdToken()}`,
          },
          body: JSON.stringify({
            type: 'account',
            recipients: [{ name: email, email, password: generatedPassword, login_url: loginUrl }],
            origin: location.origin,
          }),
        }).catch(err => console.warn('Account email failed:', err));
      }
      close();
    } catch (err) {
```

- [ ] **Step 4: Add "Renvoyer les accès" button to each user row**

In `renderUserRow`, replace:
```js
      <td>${editable
        ? `<div class="table-actions"><button class="btn-secondary btn-edit-user" data-id="${escapeHtml(u.id)}">Modifier</button></div>`
        : ''}</td>
```

With:
```js
      <td>${editable
        ? `<div class="table-actions">
            <button class="btn-secondary btn-edit-user" data-id="${escapeHtml(u.id)}">Modifier</button>
            <button class="btn-secondary btn-resend-access" data-id="${escapeHtml(u.id)}" data-email="${escapeHtml(u.email)}" ${u.id === auth.currentUser?.uid ? 'disabled title="Impossible pour soi-même"' : ''}>Renvoyer les accès</button>
           </div>`
        : ''}</td>
```

- [ ] **Step 5: Wire "Renvoyer les accès" in `renderUsersTab`**

After the existing `panel.querySelectorAll('.btn-edit-user').forEach(...)`, add:

```js
  if (editable) {
    panel.querySelectorAll('.btn-resend-access').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.id;
        const email = btn.dataset.email;
        if (!confirm(`Réinitialiser le mot de passe et renvoyer les accès à ${email} ?`)) return;
        btn.disabled = true;
        btn.textContent = 'Envoi…';
        try {
          const token = await auth.currentUser.getIdToken();
          const res = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              type: 'account',
              resetUid: uid,
              recipients: [{ name: email, email, login_url: `${location.origin}/admin/` }],
              origin: location.origin,
            }),
          });
          if (!res.ok) throw new Error(`Erreur ${res.status}`);
          btn.textContent = '✓ Envoyé';
          setTimeout(() => {
            btn.textContent = 'Renvoyer les accès';
            btn.disabled = false;
          }, 3000);
        } catch (err) {
          alert(`Erreur : ${err.message}`);
          btn.textContent = 'Renvoyer les accès';
          btn.disabled = false;
        }
      });
    });
  }
```

- [ ] **Step 6: Manual smoke test**

1. Admin → Utilisateurs → créer un nouvel utilisateur
2. Email de création arrive à l'adresse saisie avec email + mot de passe + lien
3. Sur un user existant → "Renvoyer les accès" → confirm → email de reset arrive avec nouveau mot de passe
4. Le nouveau mot de passe fonctionne pour se connecter

- [ ] **Step 7: Commit**

```bash
rtk git add admin/users.js api/send-email.js && rtk git commit -m "feat: send account email on creation and add resend-access button"
```
