export const config = { api: { bodyParser: false } };

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OAuth error: ${JSON.stringify(data)}`);
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

    const token = await getAccessToken();

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
