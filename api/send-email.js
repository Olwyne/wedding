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
      sender: { name: 'Sophie & Sob', email: process.env.BREVO_SENDER_EMAIL },
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
  if (type === 'relance') return 'Sophie & Sob – Nous attendons votre réponse 💌';
  if (type === 'rappel') return 'Sophie & Sob – On se retrouve bientôt ! 🎉';
  if (type === 'account') return 'Accès admin – Site de mariage Sophie & Sob';
  return '';
}

function buildHtml(type, recipient) {
  if (type === 'relance') return buildRelanceHtml(recipient);
  if (type === 'rappel') return buildRappelHtml(recipient);
  if (type === 'account') return buildAccountHtml(recipient);
  return '';
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
  const link = `${origin}/?invite=${encodeURIComponent(token)}`;
  return `<!DOCTYPE html><html><head>${baseStyle()}</head><body>
    <div class="wrap">
      <div class="header"><h1>Sophie &amp; Sob</h1></div>
      <div class="body">
        <p>Bonjour ${escapeHtml(name)},</p>
        <p>Nous organisons notre mariage et nous n'avons pas encore reçu votre réponse.
        Nous serions ravis de vous compter parmi nous !</p>
        <p>Merci de confirmer votre présence via le lien ci-dessous :</p>
        <a class="btn" href="${escapeHtml(link)}">Confirmer ma présence</a>
        <hr class="divider">
        <p class="zh">亲爱的 ${escapeHtml(name)}，</p>
        <p class="zh">我们正在筹备婚礼，但还未收到您的回复。我们非常期待您的到来！</p>
        <p class="zh">请点击以下链接确认您是否出席：</p>
        <a class="btn" href="${escapeHtml(link)}">确认出席</a>
      </div>
      <div class="footer">Sophie &amp; Sob · 24 juillet 2027</div>
    </div>
  </body></html>`;
}

function buildRappelHtml({ name, events }) {
  const eventList = Array.isArray(events) && events.length
    ? `<ul>${events.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`
    : '';
  // Event titles come from admin (French only); no separate ZH titles stored
  const eventListZh = eventList;
  return `<!DOCTYPE html><html><head>${baseStyle()}</head><body>
    <div class="wrap">
      <div class="header"><h1>Sophie &amp; Sob</h1></div>
      <div class="body">
        <p>Bonjour ${escapeHtml(name)},</p>
        <p>Le grand jour approche ! Nous avons hâte de vous retrouver pour célébrer avec vous.</p>
        <p><strong>Date :</strong> 24 juillet 2027</p>
        ${eventList ? `<p><strong>Vos événements :</strong></p>${eventList}` : ''}
        <p>Pour toute question, répondez directement à cet email.</p>
        <hr class="divider">
        <p class="zh">亲爱的 ${escapeHtml(name)}，</p>
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
        <p><strong>Email :</strong> ${escapeHtml(email)}<br>
           <strong>Mot de passe temporaire :</strong> <code>${escapeHtml(password)}</code></p>
        <p>Connectez-vous via le lien ci-dessous. Changez votre mot de passe après la première connexion.</p>
        <a class="btn" href="${escapeHtml(login_url)}">Accéder au site</a>
      </div>
      <div class="footer">Sophie &amp; Sob</div>
    </div>
  </body></html>`;
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
