/**
 * api/carddetails.js
 * Fetches full card details from Limitless TCG for eBay descriptions.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'Missing number' });

  const num = number.toUpperCase();
  const set = num.split('-')[0];

  try {
    const resp = await fetch(`https://onepiece.limitlesstcg.com/cards/en/${num}`, {
      headers: { 'User-Agent': 'TCGBulkLister/1.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    const get = (...patterns) => {
      for (const p of patterns) {
        const m = html.match(p);
        if (m?.[1]?.trim()) return m[1].trim().replace(/<[^>]+>/g, '').replace(/\s+/g,' ').trim();
      }
      return null;
    };

    // Name
    const name = get(/class="card-text-name"[^>]*>\s*([^<]+)/i)
      ?.replace(/\s*\([A-Z]{1,4}\d{1,2}.*/i, '').trim();

    // Card type row: "Leader • Red/Yellow • 4 Life" — grab the full row
    const typeRowMatch = html.match(/class="card-text-type[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const typeRow = typeRowMatch
      ? typeRowMatch[1].replace(/<[^>]+>/g, ' · ').replace(/\s*·\s*/g,' · ').replace(/^\s*·\s*/,'').trim()
      : null;

    // Power + Attribute row: "5000 Power • Special"
    const powerRowMatch = html.match(/class="card-text-power[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const powerRow = powerRowMatch
      ? powerRowMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ').trim()
      : null;

    // Effect text blocks
    const effectMatches = [...html.matchAll(/class="card-text-section[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
    const effects = effectMatches
      .map(m => m[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g,'\n\n')
        .trim()
      )
      .filter(t => t.length > 5);

    // Traits
    const traits = get(/class="card-text-traits[^"]*"[^>]*>\s*([^<]+)/i);

    // Rarity
    const rarityRaw = get(
      /Rarity[\s\S]*?<span[^>]*>([^<]+)<\/span>/i,
      /·\s*(SR|R|UC|C|SEC|SE|L|TR|MR|SP)\b/i
    );
    const RARITY_MAP = {
      'SECRET RARE':'SEC','SUPER RARE':'SR','RARE':'R','UNCOMMON':'UC',
      'COMMON':'C','LEADER':'L','TREASURE RARE':'TR','MANGA RARE':'MR',
      'SPECIAL':'SP','SEC':'SEC','SR':'SR','R':'R','UC':'UC',
      'C':'C','L':'L','TR':'TR','MR':'MR','SP':'SP','SE':'SE'
    };
    const rarity = RARITY_MAP[(rarityRaw||'').toUpperCase()] || rarityRaw;

    // Set name
    const setName = get(/property="og:description"\s+content="[^"]*from\s+([^".,]+)/i);

    // Image
    const imageUrl = get(/property="og:image"\s+content="([^"]+)"/i)
      || `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${set}/${num}_EN.webp`;

    return res.status(200).json({ name, rarity, setName, typeRow, powerRow, effects, traits, imageUrl });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
