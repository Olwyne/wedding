import crypto from 'crypto';
import { admin } from './lib/auth.js';

// Read-only remote MCP server (Streamable HTTP, stateless JSON-RPC).
// Auth: `Authorization: Bearer $MCP_API_KEY`. `admins` is deliberately not exposed (previewToken).
const COLLECTIONS = ['guests', 'events', 'tables', 'vendors', 'tasks', 'runOfShow', 'timelineLanes', 'blocks'];
const SINGLE_DOCS = { general: 'settings/general', budget: 'settings/budget' };

const TOOLS = [
  {
    name: 'list_collection',
    description: `Liste les documents d'une collection du back office. Collections: ${COLLECTIONS.join(', ')}. Pour guests, "status" filtre sur rsvp.status (confirmed | declined | pending).`,
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string', enum: COLLECTIONS },
        status: { type: 'string', enum: ['confirmed', 'declined', 'pending'] },
      },
      required: ['collection'],
    },
  },
  {
    name: 'get_settings',
    description: 'Lit les réglages du site (general) ou le budget (budget).',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', enum: Object.keys(SINGLE_DOCS) } },
      required: ['name'],
    },
  },
  {
    name: 'rsvp_summary',
    description: 'Totaux RSVP: invités par statut, adultes/enfants confirmés.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const db = () => admin.firestore();

// Firestore Timestamps → ISO strings so JSON stays readable.
const plain = (v) => JSON.parse(JSON.stringify(v, (_, x) => (x?.toDate ? x.toDate().toISOString() : x)));

async function callTool(name, args = {}) {
  if (name === 'list_collection') {
    if (!COLLECTIONS.includes(args.collection)) throw new Error('Unknown collection');
    const snap = await db().collection(args.collection).get();
    let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (args.collection === 'guests' && args.status) {
      docs = docs.filter((g) => (g.rsvp?.status || 'pending') === args.status);
    }
    return plain(docs);
  }
  if (name === 'get_settings') {
    const path = SINGLE_DOCS[args.name];
    if (!path) throw new Error('Unknown settings doc');
    const doc = await db().doc(path).get();
    return plain(doc.data() ?? null);
  }
  if (name === 'rsvp_summary') {
    const snap = await db().collection('guests').get();
    const out = { guests: snap.size, confirmed: 0, declined: 0, pending: 0, adults: 0, children: 0 };
    for (const d of snap.docs) {
      const r = d.data().rsvp || {};
      const status = r.status === 'confirmed' || r.status === 'declined' ? r.status : 'pending';
      out[status]++;
      if (status === 'confirmed') {
        out.adults += r.adults ?? 0;
        out.children += r.children ?? 0;
      }
    }
    return out;
  }
  throw new Error('Unknown tool');
}

function authorized(req) {
  const key = process.env.MCP_API_KEY;
  const given = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!key || !given) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(key).digest();
  return crypto.timingSafeEqual(a, b);
}

async function handleRpc(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return null; // notification (e.g. notifications/initialized)
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  if (method === 'initialize') {
    return ok({
      protocolVersion: params?.protocolVersion || '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'wedding-backoffice', version: '1.0.0' },
    });
  }
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: TOOLS });
  if (method === 'tools/call') {
    try {
      const data = await callTool(params?.name, params?.arguments);
      return ok({ content: [{ type: 'text', text: JSON.stringify(data) }] });
    } catch (e) {
      return ok({ isError: true, content: [{ type: 'text', text: e.message }] });
    }
  }
  return err(-32601, 'Method not found');
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).setHeader('Allow', 'POST').end();

  const body = req.body;
  const batch = Array.isArray(body);
  const replies = (await Promise.all((batch ? body : [body]).map(handleRpc))).filter(Boolean);
  if (!replies.length) return res.status(202).end();
  return res.status(200).json(batch ? replies : replies[0]);
}
