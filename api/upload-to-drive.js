import crypto from 'crypto';

export const config = { api: { bodyParser: false } };

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

  const fileName = req.headers['x-file-name'] || 'upload';
  const contentType = req.headers['content-type'] || 'application/octet-stream';

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const fileData = Buffer.concat(chunks);

    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const token = await getAccessToken(credentials);

    const boundary = 'drive_upload_boundary';
    const metadata = JSON.stringify({ name: fileName, parents: [process.env.GOOGLE_DRIVE_FOLDER_ID] });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error('Drive upload error:', err);
      return res.status(uploadRes.status).json({ error: 'Drive upload failed', detail: err });
    }

    const { id } = await uploadRes.json();
    res.json({ id, url: `https://drive.google.com/file/d/${id}/view` });
  } catch (err) {
    console.error('upload-to-drive error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
