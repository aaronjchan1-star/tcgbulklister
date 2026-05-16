/**
 * api/riftbound.js
 * Fetches Riftbound card details from Limitless TCG.
 * Returns: { name, rarity, setName, typeLine, powerLine, traits, effects, imageUrl }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'Missing number' });

  const num = number.toUpperCase();
  const set = num.split('-')[0];
  const fallbackImg = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/riftbound/${set}/${num}_EN.webp`;

  try {
    const resp = await fetch(`https://limitlesstcg.com/riftbound/cards/en/${num}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TCGBulkLister/1.0)', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(10000)
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    const stripTags = s => s?.replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ')
      .split('\n').map(l => l.trim()).filter(l => l).join('\n').trim() || null;

    // Name from og:title: "CardName · SetName · Limitless..."
    const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1];
    let name = null, setName = null;
    if (ogTitle) {
      const parts = ogTitle.split(/\s*·\s*/);
      name = parts[0]?.trim().replace(/\s*[-|·].*$/, '').trim() || null;
      const BAD = ['limitless','deck','latest','result','filter','riftbound'];
      const candidate = parts[1]?.trim();
      if (candidate && !BAD.some(w => candidate.toLowerCase().includes(w)) && candidate.length > 2) {
        setName = candidate;
      }
    }

    // Image
    const imageUrl = html.match(/property="og:image"\s+content="([^"]+)"/i)?.[1] || fallbackImg;

    // Card type, cost, power
    const cardType  = html.match(/>\s*(Champion|Unit|Spell|Landmark|Legend)\s*</i)?.[1] || null;
    const cost      = html.match(/Cost[^:]*:\s*<[^>]+>(\d+)/i)?.[1] || null;
    const power     = html.match(/Power[^:]*:\s*<[^>]+>(\d+)/i)?.[1] || null;
    const region    = html.match(/Region[^:]*:\s*<[^>]+>([^<]+)/i)?.[1]?.trim() || null;

    // Build type line
    const typeParts = [cardType, region, cost ? `Cost ${cost}` : null].filter(Boolean);
    const typeLine  = typeParts.length ? typeParts.join(' · ') : null;
    const powerLine = power ? `${power} Power` : null;

    // Traits/keywords
    const traitsMatch = html.match(/class="card-text-traits[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|span)>/i);
    const traits = traitsMatch ? stripTags(traitsMatch[1]) : null;

    // Effect text
    const effectMatches = [...html.matchAll(/class="card-text-section[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
    const effects = effectMatches
      .map(m => stripTags(m[1]))
      .filter(t => t && t.length > 5 && !t.match(/^(Illustrated|Block|Tournament|Latest)/i));

    // Rarity
    const rarityRaw = html.match(/·\s*(Rare|Uncommon|Common|Overnumbered|Ultimate)\b/i)?.[1]
      || html.match(/Rarity[\s\S]{0,30}?>\s*(Rare|Uncommon|Common|Overnumbered|Ultimate)\s*</i)?.[1];
    const RMAP = { 'RARE':'R','UNCOMMON':'UC','COMMON':'C','OVERNUMBERED':'ON','ULTIMATE':'UR' };
    const rarity = RMAP[(rarityRaw||'').toUpperCase()] || rarityRaw || null;

    return res.status(200).json({ name, rarity, setName, typeLine, powerLine, traits, effects, imageUrl });
  } catch(e) {
    return res.status(500).json({ error: e.message, name: null, rarity: null, setName: null, imageUrl: fallbackImg });
  }
}
