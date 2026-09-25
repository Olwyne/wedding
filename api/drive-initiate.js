import crypto from 'crypto';
import { verifyToken } from './lib/auth.js';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64url(Buffer.from(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = base64url(sign.sign(credentials.private_key));
  const jwt = `${header}.${payload}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try { await verifyToken(req); }
  catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const { name, contentType, size } = req.body;
  if (!name || !contentType || !size) return res.status(400).json({ error: 'Missing fields' });

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const token = await getAccessToken(credentials);

    const initRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': contentType,
          'X-Upload-Content-Length': String(size),
        },
        body: JSON.stringify({
          name,
          parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
        }),
      }
    );

    if (!initRes.ok) {
      const err = await initRes.text();
      console.error('Drive initiate error:', err);
      return res.status(502).json({ error: 'Drive initiate failed', detail: err });
    }

    const uploadUrl = initRes.headers.get('location');
    res.json({ uploadUrl });
  } catch (err) {
    console.error('drive-initiate error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
