import admin from 'firebase-admin';
import crypto from 'crypto';

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

async function sendViaBrevo(to, toName, subject, html) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Sophie & Ruiyuan', email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: to, name: toName }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo ${res.status}: ${body}`);
  }
}

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
  return admin.auth().verifyIdToken(token);
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSubject(type) {
  if (type === 'relance') return 'Sophie & Ruiyuan – Nous attendons votre réponse 💌';
  if (type === 'rappel') return 'Sophie & Ruiyuan – On se retrouve bientôt ! 🎉';
  if (type === 'account') return 'Accès admin – Site de mariage Sophie & Ruiyuan';
  return '';
}

function buildHtml(type, recipient) {
  if (type === 'relance') return buildRelanceHtml(recipient);
  if (type === 'rappel') return buildRappelHtml(recipient);
  if (type === 'account') return buildAccountHtml(recipient);
  return '';
}

function emailHeader() {
  return `
    <tr>
      <td style="background:#6E1A1A;padding:36px 32px;text-align:center;">
        <div style="font-size:38px;color:#C1993F;line-height:1;margin-bottom:10px;">囍</div>
        <div style="color:#F4E9CE;font-size:13px;letter-spacing:.2em;text-transform:uppercase;">Sophie &amp; Ruiyuan</div>
        <div style="color:#F4E9CE;font-size:12px;letter-spacing:.15em;opacity:.75;margin-top:4px;">24 · 07 · 2027</div>
      </td>
    </tr>`;
}

function emailFooter() {
  return `
    <tr>
      <td style="padding:30px 32px 36px;text-align:center;">
        <div style="height:1px;background:#eee;margin-bottom:24px;"></div>
        <p style="margin:0;font-size:13px;color:#aaa;letter-spacing:.03em;">Avec toute notre affection,<br>Sophie &amp; Ruiyuan</p>
      </td>
    </tr>`;
}

function emailWrap(rows) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background:#f5f1e6;">
    <div style="background:#f5f1e6;padding:40px 16px;font-family:Georgia,'Times New Roman',serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);">
        ${emailHeader()}
        ${rows}
        ${emailFooter()}
      </table>
    </div>
  </body></html>`;
}

function buildRelanceHtml({ name, token, origin, lang }) {
  const linkZh = escapeHtml(`${origin}/?invite=${encodeURIComponent(token)}&lang=zh`);
  const link = lang === 'zh'
    ? linkZh
    : escapeHtml(`${origin}/?invite=${encodeURIComponent(token)}`);
  const btnStyle = 'display:inline-block;background:#6E1A1A;color:#F4E9CE!important;text-decoration:none;padding:13px 30px;border-radius:6px;font-size:14px;letter-spacing:.05em;margin:20px 0;';
  return emailWrap(`
    <tr><td style="padding:34px 32px 10px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#3a1010;font-weight:600;">Nous attendons votre réponse 💌</h1>
      <p style="margin:0 0 8px;font-size:14px;color:#3a1010;line-height:1.7;">Bonjour ${escapeHtml(name)},</p>
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;">Nous organisons notre mariage et nous n'avons pas encore reçu votre réponse. Nous serions ravis de vous compter parmi nous !</p>
      <p style="margin:0 0 4px;font-size:14px;color:#555;">Merci de confirmer votre présence :</p>
      <a href="${link}" style="${btnStyle}">Confirmer ma présence</a>
    </td></tr>
    <tr><td style="padding:0 32px 10px;">
      <div style="height:1px;background:#eee;margin-bottom:20px;"></div>
      <p style="margin:0 0 8px;font-size:14px;color:#3a1010;">亲爱的 ${escapeHtml(name)}，</p>
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;">我们正在筹备婚礼，但还未收到您的回复。我们非常期待您的到来！</p>
      <a href="${linkZh}" style="${btnStyle}">确认出席</a>
    </td></tr>`);
}

function buildRappelHtml({ name, events }) {
  const eventList = Array.isArray(events) && events.length
    ? `<ul style="margin:8px 0 16px;padding-left:20px;color:#3a1010;font-size:14px;">${events.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`
    : '';
  // Event titles come from admin (French only); no separate ZH titles stored
  const eventListZh = eventList;
  return emailWrap(`
    <tr><td style="padding:34px 32px 10px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#3a1010;font-weight:600;">On se retrouve bientôt ! 🎉</h1>
      <p style="margin:0 0 8px;font-size:14px;color:#3a1010;line-height:1.7;">Bonjour ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.7;">Le grand jour approche ! Nous avons hâte de vous retrouver pour célébrer avec vous.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;color:#999;font-size:12px;letter-spacing:.05em;text-transform:uppercase;width:40%;">Date</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;color:#3a1010;font-size:14px;">24 juillet 2027</td>
        </tr>
        ${eventList ? `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;color:#999;font-size:12px;letter-spacing:.05em;text-transform:uppercase;vertical-align:top;">Événements</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;color:#3a1010;font-size:14px;">${eventList}</td>
        </tr>` : ''}
      </table>
      <p style="margin:16px 0 0;font-size:13px;color:#aaa;">Pour toute question, répondez directement à cet email.</p>
    </td></tr>
    <tr><td style="padding:0 32px 10px;">
      <div style="height:1px;background:#eee;margin:20px 0;"></div>
      <p style="margin:0 0 8px;font-size:14px;color:#3a1010;">亲爱的 ${escapeHtml(name)}，</p>
      <p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.7;">婚礼的日子快到了！我们非常期待与您共同庆祝这一美好时刻。</p>
      ${eventListZh ? `<p style="margin:0 0 4px;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:.05em;">您的活动</p>${eventListZh}` : ''}
      <p style="margin:8px 0 0;font-size:13px;color:#aaa;">如有任何问题，请直接回复此邮件。</p>
    </td></tr>`);
}

function buildAccountHtml({ email, password, login_url }) {
  const btnStyle = 'display:inline-block;background:#6E1A1A;color:#F4E9CE!important;text-decoration:none;padding:13px 30px;border-radius:6px;font-size:14px;letter-spacing:.05em;margin:20px 0;';
  return emailWrap(`
    <tr><td style="padding:34px 32px 10px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#3a1010;font-weight:600;">Votre accès admin</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;">Un compte administrateur a été créé pour vous.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;color:#999;font-size:12px;letter-spacing:.05em;text-transform:uppercase;width:40%;">Email</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;color:#3a1010;font-size:14px;">${escapeHtml(email)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;color:#999;font-size:12px;letter-spacing:.05em;text-transform:uppercase;">Mot de passe</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;color:#3a1010;font-size:14px;font-family:monospace;">${escapeHtml(password)}</td>
        </tr>
      </table>
      <a href="${escapeHtml(login_url)}" style="${btnStyle}">Accéder au site</a>
      <p style="margin:0;font-size:12px;color:#aaa;">Changez votre mot de passe après la première connexion.</p>
    </td></tr>`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let decodedToken;
  try {
    decodedToken = await verifyToken(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { type, recipients, origin } = req.body;
  if (!type || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'Missing type or recipients' });
  }

  const VALID_TYPES = ['relance', 'rappel', 'account'];
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `Unknown type: ${type}` });
  }

  if (recipients.length > 50) {
    return res.status(400).json({ error: 'Too many recipients (max 50 per request)' });
  }

  // Password reset for admin resend-accès
  if (type === 'account' && req.body.resetUid) {
    const resetUid = req.body.resetUid;
    const adminDoc = await admin.firestore().collection('admins').doc(resetUid).get();
    if (!adminDoc.exists) {
      return res.status(403).json({ error: 'Target UID is not an admin' });
    }
    const requestorDoc = await admin.firestore().collection('admins').doc(decodedToken.uid).get();
    if (requestorDoc.data()?.permissions?.users !== 'write') {
      return res.status(403).json({ error: 'Insufficient permission' });
    }
    const newPassword = generatePassword();
    await admin.auth().updateUser(resetUid, { password: newPassword });
    // Re-build recipients with new password
    recipients[0].password = newPassword;
  }

  const subject = buildSubject(type);
  const sent = [];
  const failed = [];

  for (const recipient of recipients) {
    if (!recipient.email) { failed.push({ email: '(none)', error: 'no email' }); continue; }
    try {
      await sendViaBrevo(
        recipient.email,
        recipient.name,
        subject,
        buildHtml(type, { ...recipient, origin: origin || '' }),
      );
      sent.push(recipient.email);
    } catch (err) {
      failed.push({ email: recipient.email, error: err.message });
    }
    if (recipients.length > 1) await new Promise(r => setTimeout(r, 100));
  }

  res.status(200).json({ sent: sent.length, failed });
}
