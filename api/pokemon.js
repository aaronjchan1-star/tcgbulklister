/**
 * api/pokemon.js
 * Resilient proxy for pokemontcg.io card lookups.
 * pokemontcg.io frequently returns transient 500/503 errors and rate-limits
 * un-keyed traffic, which was surfacing to users as "Search failed: API error 500".
 * This endpoint retries transient failures with backoff, uses an optional API key
 * (POKEMONTCG_API_KEY) for higher reliability, and never hard-fails — it returns
 * { data: [], upstreamError } so the client can show a friendly message instead.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q        = req.query.q;
  const pageSize = req.query.pageSize || '20';
  if (!q) return res.status(400).json({ error: 'Missing query', data: [] });

  const key = process.env.POKEMONTCG_API_KEY;  // optional — works without it
  const url = `https://api.pokemontcg.io/v2/cards`
    + `?q=${encodeURIComponent(q)}`
    + `&select=id,name,number,set,images,rarity,tcgplayer`
    + `&orderBy=-set.releaseDate&pageSize=${encodeURIComponent(pageSize)}`;
  const headers = key ? { 'X-Api-Key': key } : {};

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 524]);

  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers });
      if (r.ok) {
        const data = await r.json();
        return res.status(200).json({ data: data.data || [], count: (data.data || []).length });
      }
      lastStatus = r.status;
      if (RETRYABLE.has(r.status) && attempt < 3) {
        await sleep(400 * Math.pow(2, attempt) + Math.random() * 250);
        continue;
      }
      // Non-retryable or exhausted — soft-fail so the client stays functional
      return res.status(200).json({ data: [], upstreamError: r.status, retryable: RETRYABLE.has(r.status) });
    } catch (e) {
      lastStatus = 'network';
      if (attempt < 3) { await sleep(400 * Math.pow(2, attempt)); continue; }
    }
  }
  return res.status(200).json({ data: [], upstreamError: lastStatus || 'unknown', retryable: true });
}
