/**
 * api/sync.js
 * Cross-device sync for listings via Upstash Redis (KV store).
 * GET  ?code=XXXXXX        → returns stored listings for that sync code
 * POST { code, listings }  → saves listings for that sync code
 *
 * Setup (one-time, free):
 *   1. Create an Upstash Redis DB at https://console.upstash.com (or Vercel → Storage → KV)
 *   2. Add env vars to Vercel:
 *        KV_REST_API_URL   (or UPSTASH_REDIS_REST_URL)
 *        KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_TOKEN)
 *   If not configured, sync is disabled gracefully and the app still works locally.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    return res.status(200).json({ configured: false, message: 'Sync not configured' });
  }

  // Helper to call Upstash REST API
  async function kv(command) {
    const r = await fetch(`${KV_URL}/${command.join('/')}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    if (!r.ok) throw new Error(`KV ${r.status}`);
    return r.json();
  }
  async function kvSet(key, value) {
    const r = await fetch(`${KV_URL}/set/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: value
    });
    if (!r.ok) throw new Error(`KV set ${r.status}`);
    return r.json();
  }

  try {
    if (req.method === 'GET') {
      const code = (req.query.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      if (!code) return res.status(400).json({ error: 'Missing sync code' });

      const result = await kv(['get', `tcg:sync:${code}`]);
      const raw    = result.result;
      let data = { listings: [], updatedAt: null };
      if (raw) {
        try { data = JSON.parse(decodeURIComponent(raw)); }
        catch(e) { try { data = JSON.parse(raw); } catch(e2) {} }
      }
      return res.status(200).json({ configured: true, ...data });
    }

    if (req.method === 'POST') {
      const { code, listings } = req.body;
      const cleanCode = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      if (!cleanCode) return res.status(400).json({ error: 'Missing sync code' });
      if (!Array.isArray(listings)) return res.status(400).json({ error: 'listings must be an array' });

      const payload = JSON.stringify({ listings, updatedAt: Date.now() });
      // Cap payload to ~1MB to stay within free tier limits
      if (payload.length > 1_000_000) return res.status(413).json({ error: 'Too many listings to sync (max ~1MB)' });

      await kvSet(`tcg:sync:${cleanCode}`, encodeURIComponent(payload));
      // Set 30-day expiry so old codes clean up
      await fetch(`${KV_URL}/expire/tcg:sync:${cleanCode}/2592000`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      return res.status(200).json({ configured: true, ok: true, updatedAt: Date.now() });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
