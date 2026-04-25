/**
 * api/carddetails.js
 * Fetches full card details from Limitless TCG.
 * Returns: { name, rarity, setName, typeRow, powerRow, effects, traits, imageUrl }
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
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TCGBulkLister/1.0)', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(10000)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    const stripTags = s => s?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;

    // ── Name ──────────────────────────────────────────────────
    // Try multiple patterns — Limitless uses different markup versions
    let name = null;
    const namePatterns = [
      /class="card-text-name"[^>]*>([\s\S]*?)<\//i,
      /<h1[^>]*class="[^"]*name[^"]*"[^>]*>([\s\S]*?)<\//i,
      /property="og:title"\s+content="([^"·|]+)/i,
      /<title>([^·|<]+)/i,
    ];
    for (const p of namePatterns) {
      const m = html.match(p);
      const candidate = stripTags(m?.[1]);
      if (candidate && candidate.length > 0 && !candidate.toLowerCase().includes('limitless')) {
        // Remove set code suffix and trailing noise
        name = candidate.replace(/\s*\([A-Z]{1,4}\d{1,2}.*/i, '')
                         .replace(/\s*[-|·].*$/, '').trim();
        if (name.length > 0) break;
      }
    }

    // ── Card type row ──────────────────────────────────────────
    // e.g. "Leader • Red/Yellow • 4 Life" or "Character • Red • Cost 3"
    const typeRowMatch = html.match(/class="card-text-type[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|span)>/i);
    const typeRow = typeRowMatch
      ? stripTags(typeRowMatch[1])?.replace(/\s*•\s*/g, ' · ').replace(/^\s*·\s*/, '')
      : null;

    // ── Power / Attribute row ──────────────────────────────────
    // e.g. "5000 Power • Special"
    const powerRowMatch = html.match(/class="card-text-power[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|span)>/i);
    const powerRow = powerRowMatch ? stripTags(powerRowMatch[1]) : null;

    // ── Traits ────────────────────────────────────────────────
    const traitsMatch = html.match(/class="card-text-traits[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|span)>/i);
    const traits = traitsMatch ? stripTags(traitsMatch[1]) : null;

    // ── Effect text blocks ─────────────────────────────────────
    const effectMatches = [...html.matchAll(/class="card-text-section[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
    const effects = effectMatches
      .map(m => m[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim())
      .filter(t => t.length > 5 && !t.match(/^(Illustrated|Block|Tournament)/i));

    // ── Rarity ────────────────────────────────────────────────
    const rarityMatch = html.match(/·\s*(SR|R|UC|C|SEC|SE|L|SP|TR|MR)\b/i)
      || html.match(/Rarity[\s\S]{0,50}?>\s*(Secret Rare|Super Rare|Rare|Uncommon|Common|Leader|Special|Treasure Rare|Manga Rare)\s*</i);
    const RMAP = { 'SECRET RARE':'SEC','SUPER RARE':'SR','RARE':'R','UNCOMMON':'UC',
      'COMMON':'C','LEADER':'L','SPECIAL':'SP','TREASURE RARE':'TR','MANGA RARE':'MR',
      'SEC':'SEC','SR':'SR','R':'R','UC':'UC','C':'C','L':'L','SP':'SP','TR':'TR','MR':'MR','SE':'SE' };
    const rarity = RMAP[(rarityMatch?.[1]||'').trim().toUpperCase()] || rarityMatch?.[1]?.trim() || null;

    // ── Set name ──────────────────────────────────────────────
    // From og:description: "Card from Set Name"
    const descMatch = html.match(/property="og:description"\s+content="([^"]+)"/i);
    let setName = null;
    if (descMatch) {
      const fromMatch = descMatch[1].match(/from\s+(.+?)(?:\.|,|$)/i);
      if (fromMatch) setName = fromMatch[1].trim();
    }
    // Fallback: look for set name in breadcrumb or h2
    if (!setName) {
      const h2Match = html.match(/<h2[^>]*>([^<]+)<\/h2>/i);
      if (h2Match && h2Match[1].length < 60) setName = h2Match[1].trim();
    }

    // ── Image ─────────────────────────────────────────────────
    const imgMatch = html.match(/property="og:image"\s+content="([^"]+)"/i)
      || html.match(/class="card-image[^"]*"[\s\S]*?src="([^"]+)"/i);
    const imageUrl = imgMatch?.[1]
      || `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${set}/${num}_EN.webp`;

    return res.status(200).json({ name, rarity, setName, typeRow, powerRow, effects, traits, imageUrl });

  } catch(e) {
    console.error('carddetails error:', e.message);
    return res.status(500).json({
      error: e.message,
      name: null, rarity: null, setName: null,
      imageUrl: `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${num.split('-')[0]}/${num}_EN.webp`
    });
  }
}
