/**
 * api/riftbound.js
 * Fetches Riftbound card details. Tries multiple endpoint patterns.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'Missing number' });

  const num = number.toUpperCase().trim();
  const numLower = num.toLowerCase();

  // Try multiple riftcodex endpoint patterns
  const urls = [
    `https://api.riftcodex.com/api/cards/by-riftbound-id/${numLower}`,
    `https://api.riftcodex.com/api/cards/${numLower}`,
    `https://api.riftcodex.com/api/cards?riftbound_id=${numLower}`,
    `https://api.riftcodex.com/api/cards/search?q=${encodeURIComponent(num)}`,
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      if (!resp.ok) continue;
      const data = await resp.json();

      // Response could be a single card or { items: [...] } or { data: [...] }
      let card = null;
      if (data?.name) card = data;
      else if (Array.isArray(data?.items) && data.items.length) card = data.items[0];
      else if (Array.isArray(data?.data) && data.data.length) card = data.data[0];
      else if (Array.isArray(data) && data.length) card = data[0];

      if (card?.name) {
        return res.status(200).json(formatRiftbound(card));
      }
    } catch(e) { /* try next */ }
  }

  return res.status(404).json({ error: `Card ${num} not found in Riftbound database. Type name manually.`, name: null });
}

function formatRiftbound(data) {
  const typeParts = [data.type, data.domain || data.faction].filter(Boolean);
  const typeLine  = typeParts.join(' · ') || null;
  const powerLine = data.might !== undefined ? `${data.might} Might${data.energy !== undefined ? ' · ' + data.energy + ' Energy' : ''}` : null;
  const imageUrl  = data.images?.[0]?.medium || data.images?.[0]?.small || data.image_url || data.image || null;
  const RMAP = { 'common':'C','uncommon':'UC','rare':'R','overnumbered':'ON','ultimate':'UR' };
  const rarity = RMAP[(data.rarity||'').toLowerCase()] || data.rarity || null;
  const effects = data.rules
    ? (Array.isArray(data.rules) ? [data.rules.join('\n')] : [data.rules])
    : data.ability_html
      ? [data.ability_html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()]
      : null;

  return {
    name:     data.name || null,
    rarity,
    setName:  data.expansion?.name || data.set_name || data.set || null,
    typeLine,
    powerLine,
    traits:   Array.isArray(data.tags) ? data.tags.join(', ') : null,
    effects,
    imageUrl
  };
}
