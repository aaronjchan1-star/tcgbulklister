/**
 * api/riftbound.js
 * Fetches Riftbound card details from riftcodex.com (free, no auth).
 * Supports: OGN-001, OGS-001, SFD-001, UNL-001 formats
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'Missing number' });

  const num = number.toUpperCase().trim();

  try {
    // riftcodex.com — free community API, supports OGN-001, UNL-053 etc.
    const url = `https://api.riftcodex.com/api/cards/${encodeURIComponent(num.toLowerCase())}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'TCGBulkLister/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000)
    });

    if (!resp.ok) {
      // Try without zero-padding: UNL-53 if UNL-053 fails
      const stripped = num.replace(/^([A-Z]+-?)0+(\d+)$/, '$1$2');
      if (stripped !== num) {
        const resp2 = await fetch(`https://api.riftcodex.com/api/cards/${encodeURIComponent(stripped.toLowerCase())}`, {
          headers: { 'User-Agent': 'TCGBulkLister/1.0' },
          signal: AbortSignal.timeout(6000)
        });
        if (!resp2.ok) throw new Error(`Card not found: ${num}`);
        const data2 = await resp2.json();
        return res.status(200).json(formatRiftbound(data2));
      }
      throw new Error(`Card not found: ${num}`);
    }

    const data = await resp.json();
    return res.status(200).json(formatRiftbound(data));

  } catch(e) {
    return res.status(404).json({ error: e.message, name: null });
  }
}

function formatRiftbound(data) {
  // riftcodex returns: name, type, rarity, domain/faction, energy, might, tags, rules, images, expansion
  const typeParts = [data.type, data.domain || data.faction].filter(Boolean);
  const typeLine  = typeParts.join(' · ') || null;
  const powerLine = data.might !== undefined ? `${data.might} Might${data.energy !== undefined ? ` · ${data.energy} Energy` : ''}` : null;

  // Image — try multiple fields
  const imageUrl = data.images?.[0]?.medium
    || data.images?.[0]?.small
    || data.image_url
    || null;

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
    setName:  data.expansion?.name || data.set_name || null,
    typeLine,
    powerLine,
    traits:   data.tags?.join(', ') || null,
    effects,
    imageUrl
  };
}
