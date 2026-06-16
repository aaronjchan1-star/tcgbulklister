/**
 * api/relay.js
 * Live image relay between phone (capture) and desktop (scanner).
 * Phone POSTs captured photos to a session queue; desktop GETs (pops) them.
 * Uses the same Upstash Redis store as sync.
 *
 *   POST { session, image, mediaType }  → queue an image
 *   GET  ?session=XXXXXX                → pop up to 10 queued images
 *   GET  ?session=XXXXXX&ping=1         → phone heartbeat / connection check
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!KV_URL || !KV_TOKEN) return res.status(200).json({ configured: false });

  async function redis(cmd) {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd)
    });
    if (!r.ok) throw new Error(`Redis ${r.status}`);
    return r.json();
  }

  const clean = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

  try {
    if (req.method === 'POST') {
      const { session, image, mediaType, ping } = req.body || {};
      const key = `tcg:relay:${clean(session)}`;
      if (!clean(session)) return res.status(400).json({ error: 'Missing session' });

      if (ping) {
        // mark phone connected
        await redis(['SET', `tcg:relayconn:${clean(session)}`, '1', 'EX', '60']);
        return res.status(200).json({ configured: true, ok: true });
      }

      if (!image) return res.status(400).json({ error: 'Missing image' });
      const payload = JSON.stringify({ image, mediaType: mediaType || 'image/jpeg', ts: Date.now() });
      if (payload.length > 4_500_000) return res.status(413).json({ error: 'Image too large' });

      await redis(['RPUSH', key, payload]);
      await redis(['EXPIRE', key, '600']);  // 10-min session
      await redis(['SET', `tcg:relayconn:${clean(session)}`, '1', 'EX', '60']);
      return res.status(200).json({ configured: true, ok: true });
    }

    if (req.method === 'GET') {
      const session = clean(req.query.session);
      if (!session) return res.status(400).json({ error: 'Missing session' });
      const key = `tcg:relay:${session}`;

      if (req.query.ping) {
        const conn = await redis(['GET', `tcg:relayconn:${session}`]);
        return res.status(200).json({ configured: true, connected: !!conn.result });
      }

      // Pop up to 10 queued images this poll
      const images = [];
      for (let i = 0; i < 10; i++) {
        const popped = await redis(['LPOP', key]);
        if (!popped.result) break;
        try { images.push(JSON.parse(popped.result)); } catch(e) {}
      }
      const conn = await redis(['GET', `tcg:relayconn:${session}`]);
      return res.status(200).json({ configured: true, images, connected: !!conn.result });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
