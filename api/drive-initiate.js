import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { name, contentType, size } = req.body;
  if (!name || !contentType || !size) return res.status(400).json({ error: 'Missing fields' });

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    const authClient = await auth.getClient();
    const { token } = await authClient.getAccessToken();

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
      return res.status(502).json({ error: 'Drive initiate failed' });
    }

    const uploadUrl = initRes.headers.get('location');
    res.json({ uploadUrl });
  } catch (err) {
    console.error('drive-initiate error:', err);
    res.status(500).json({ error: err.message });
  }
}
