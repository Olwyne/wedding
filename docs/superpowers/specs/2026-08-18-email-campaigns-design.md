# Email Campaigns — Design Spec

**Date:** 2026-08-18  
**Status:** Approved

## Goal

Add three manual email types to the admin panel:
1. **Relance** — follow-up for guests who haven't responded (pending)
2. **Rappel J** — logistics reminder for confirmed guests before the wedding
3. **Compte** — credentials email when creating a new admin account

## Architecture

```
Admin browser
  └─ getIdToken() → Firebase Auth
  └─ POST /api/send-email
       { type, recipients: [{name, email, token?, events?}] }
       Authorization: Bearer <idToken>

Vercel Function /api/send-email.js
  ├─ Verifies idToken via firebase-admin SDK
  ├─ Builds HTML (FR + ZH stacked, template literals per type)
  └─ Calls Resend API → sends emails

Resend → recipients
```

### New files
- `api/send-email.js` — Vercel serverless function
- `api/package.json` — `{ "dependencies": { "firebase-admin": "^12", "resend": "^3" } }`

### Environment variables (Vercel)
- `RESEND_API_KEY` — Resend API key
- `FIREBASE_SERVICE_ACCOUNT` — Firebase service account JSON (stringified), used by firebase-admin to verify ID tokens

### Existing files modified
- `admin/guests.js` — bulk send buttons + per-row send icon + confirmation modal
- `admin/users.js` — auto-send `account` email on user creation + resend button per row

## Email Types

### `relance`
- **Recipients:** pending guests with a non-empty `email` field
- **Trigger:** manual — bulk button or individual row action
- **Subject:** `Sophie & Sob – Nous attendons votre réponse 💌`
- **Body (FR then ZH):**
  - FR: greeting, "nous attendons votre réponse", CTA button → `https://<site>/?token={token}`
  - ZH: same content in Chinese
- **Variables needed per recipient:** `name`, `email`, `token`

### `rappel`
- **Recipients:** confirmed guests with a non-empty `email` field
- **Trigger:** manual — bulk button or individual row action
- **Subject:** `Sophie & Sob – On se retrouve bientôt ! 🎉`
- **Body (FR then ZH):**
  - FR: excitement message, date (24 juillet 2027), venue/logistics reminder, confirmed events list
  - ZH: same
- **Variables needed per recipient:** `name`, `email`, `events` (array of event titles)

### `account`
- **Recipients:** newly created admin user
- **Trigger:** automatic on user creation in `admin/users.js` (after Firestore write succeeds); also a "Renvoyer les accès" button per user row
- **Subject:** `Accès admin – Site de mariage Sophie & Sob`
- **Body (FR/EN, no ZH — internal use):**
  - Email address, temporary password, login URL
- **Variables needed:** `email`, `password`, `login_url`

## UI — Admin

### Onglet Invités (`admin/guests.js`)

- Bulk action button appears in the filter bar (right side), context-sensitive:
  - Filter "En attente" active → **"📧 Relancer tous (N)"** (N = pending guests with email)
  - Filter "Confirmés" active → **"📧 Rappel J à tous (N)"**
  - Other filters → no bulk email button
- Each guest row gains a `✉` icon button in the existing actions column
  - Disabled + tooltip "Pas d'email renseigné" when guest has no email
- Both bulk and individual actions open a **confirmation modal** before sending

### Confirmation modal (shared component)

For individual send:
```
Envoyer un email de [relance / rappel] à :
  • {name} ({email})

Sujet : "..."

[Envoyer]  [Annuler]
```

For bulk send:
```
Envoyer un email de [relance / rappel] à N invités :
  • Alice (alice@mail.com)
  • Bob (bob@mail.com)
  … (scrollable list)

[Envoyer à tous]  [Annuler]
```

Modal shows a spinner during send; reports success count / error count on completion.

### Onglet Utilisateurs (`admin/users.js`)

- After successful user creation → auto-call `/api/send-email` with `type: 'account'`
- If email send fails → show warning (non-blocking, user is still created)
- Each user row gets a **"Renvoyer les accès"** button (disabled for self)
  - Requires storing the generated password somewhere — **not in Firestore**
  - Therefore: "Renvoyer les accès" generates a **new password**, updates Firebase Auth, updates Firestore if needed, then sends the new credentials
  - This means `admin/users.js` needs a "reset password + resend" flow, not just resend

## Auth / Security

- Admin client calls `auth.currentUser.getIdToken()` before each POST
- Vercel function verifies the token with `firebase-admin`; returns 401 on failure
- `RESEND_API_KEY` and `FIREBASE_SERVICE_ACCOUNT` never leave the server

## Error Handling

- Guest has no email → button disabled client-side; function also rejects empty email (belt-and-suspenders)
- Resend API error → function returns `{ sent: N, failed: [{email, error}] }` — modal shows partial success
- Firebase token expired → 401 → client shows "Session expirée, rechargez la page"
- Bulk send: send sequentially with 100ms delay to avoid Resend rate limits (100 emails/sec on free tier)

## Out of Scope

- Scheduled/automated sends (cron) — all sends are manual
- Email open/click tracking
- Unsubscribe flow
- Template editor in admin UI
