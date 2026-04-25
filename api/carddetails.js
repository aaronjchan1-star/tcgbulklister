/**
 * api/carddetails.js
 * Fetches full card details from Limitless TCG.
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
    let name = null;
    for (const p of [
      /class="card-text-name"[^>]*>([\s\S]*?)<\//i,
      /property="og:title"\s+content="([^"·|]+)/i,
      /<title>([^·|<]+)/i,
    ]) {
      const m = html.match(p);
      const candidate = stripTags(m?.[1]);
      if (candidate && !candidate.toLowerCase().includes('limitless')) {
        name = candidate.replace(/\s*\([A-Z]{1,4}\d{1,2}.*/i, '').replace(/\s*[-|·].*$/, '').trim();
        if (name.length > 0) break;
      }
    }

    // ── Set name ──────────────────────────────────────────────
    // Best source: the og:description which Limitless formats as
    // "CardName · Rarity · SetName · Limitless One Piece TCG"
    let setName = null;
    const ogDesc = html.match(/property="og:description"\s+content="([^"]+)"/i)?.[1];
    if (ogDesc) {
      // Format: "Name · SR · Set Name · Limitless..."
      // Split on · and find the part that's not a rarity/name/limitless
      const parts = ogDesc.split(/\s*[·•]\s*/);
      const rarities = new Set(['SR','R','UC','C','SEC','SE','L','SP','TR','MR','PR']);
      for (const part of parts) {
        const clean = part.trim();
        if (!clean) continue;
        if (clean.toLowerCase().includes('limitless')) continue;
        if (clean.toLowerCase().includes('one piece')) continue;
        if (rarities.has(clean.toUpperCase())) continue;
        if (clean === name) continue;
        if (clean.length > 3 && clean.length < 60) {
          setName = clean;
          break;
        }
      }
    }

    // Fallback: og:title is "CardName · SetName · Limitless..."
    if (!setName) {
      const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1];
      if (ogTitle) {
        const parts = ogTitle.split(/\s*·\s*/);
        if (parts.length >= 2) {
          const candidate = parts[1]?.trim();
          if (candidate && !candidate.toLowerCase().includes('limitless') && candidate.length > 2) {
            setName = candidate;
          }
        }
      }
    }

    // ── Card type row ──────────────────────────────────────────
    const typeRowMatch = html.match(/class="card-text-type[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|span)>/i);
    const typeRow = typeRowMatch
      ? stripTags(typeRowMatch[1])?.replace(/\s*[•·]\s*/g, ' · ').replace(/^\s*·\s*/, '')
      : null;

    // ── Power row ─────────────────────────────────────────────
    const powerRowMatch = html.match(/class="card-text-power[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|span)>/i);
    const powerRow = powerRowMatch ? stripTags(powerRowMatch[1]) : null;

    // ── Traits ────────────────────────────────────────────────
    const traitsMatch = html.match(/class="card-text-traits[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|span)>/i);
    const traits = traitsMatch ? stripTags(traitsMatch[1]) : null;

    // ── Effect text ───────────────────────────────────────────
    const effectMatches = [...html.matchAll(/class="card-text-section[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
    const effects = effectMatches
      .map(m => m[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim())
      .filter(t => t.length > 5 && !t.match(/^(Illustrated|Block|Tournament|Latest)/i));

    // ── Rarity ────────────────────────────────────────────────
    const rarityMatch = html.match(/·\s*(SR|R|UC|C|SEC|SE|L|SP|TR|MR)\b/i)
      || html.match(/(Secret Rare|Super Rare|(?<![A-Za-z])Rare(?![A-Za-z])|Uncommon|Common|Leader)\b/i);
    const RMAP = {
      'SECRET RARE':'SEC','SUPER RARE':'SR','RARE':'R','UNCOMMON':'UC',
      'COMMON':'C','LEADER':'L','SPECIAL':'SP','TREASURE RARE':'TR','MANGA RARE':'MR',
      'SEC':'SEC','SR':'SR','R':'R','UC':'UC','C':'C','L':'L','SP':'SP','TR':'TR','MR':'MR','SE':'SE'
    };
    const rarity = RMAP[(rarityMatch?.[1]||'').trim().toUpperCase()] || null;

    // ── Image ─────────────────────────────────────────────────
    const imgMatch = html.match(/property="og:image"\s+content="([^"]+)"/i);
    const imageUrl = imgMatch?.[1]
      || `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${set}/${num}_EN.webp`;

    return res.status(200).json({ name, rarity, setName, typeRow, powerRow, effects, traits, imageUrl });

  } catch(e) {
    return res.status(500).json({
      error: e.message, name: null, rarity: null, setName: null,
      imageUrl: `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${set}/${num}_EN.webp`
    });
  }
}
