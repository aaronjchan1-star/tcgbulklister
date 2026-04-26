/**
 * api/carddetails.js — Fetches card details from Limitless TCG
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'Missing number' });

  const num = number.toUpperCase();
  const set = num.split('-')[0];
  const fallbackImg = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${set}/${num}_EN.webp`;

  try {
    const resp = await fetch(`https://onepiece.limitlesstcg.com/cards/en/${num}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TCGBulkLister/1.0)', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(10000)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    // Clean HTML to plain text
    const clean = s => s
      ? s.replace(/<br\s*\/?>/gi, '\n')
           .replace(/<[^>]+>/g, '')
           .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
           .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
           .replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ')
           .split('\n').map(l => l.trim()).filter(l => l).join('\n').trim()
      : null;

    // ── Name ──────────────────────────────────────────────────
    let name = null;
    for (const p of [
      /property="og:title"\s+content="([^"·|]+)/i,
      /<title>([^·|<]+)/i,
    ]) {
      const m = html.match(p);
      const c = m?.[1]?.replace(/<[^>]+>/g, '').trim();
      if (c && !c.toLowerCase().includes('limitless')) {
        name = c.replace(/\s*\([A-Z]{1,4}\d{1,2}.*/i, '').replace(/\s*[-|·].*$/, '').trim();
        if (name) break;
      }
    }

    // ── Set name from og:title: "Name · SetName · Limitless..." ─
    let setName = null;
    const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1];
    if (ogTitle) {
      const parts = ogTitle.split(/\s*·\s*/);
      // parts[0]=name, parts[1]=setName, parts[2]=Limitless...
      if (parts.length >= 2) {
        const candidate = parts[1]?.trim();
        const BAD = ['limitless','deck','latest','result','filter','one piece tcg'];
        if (candidate && !BAD.some(w => candidate.toLowerCase().includes(w)) && candidate.length > 3) {
          setName = candidate;
        }
      }
    }

    // ── Card stats — parse the card-text div cleanly ───────────
    // Limitless renders stats as definition-style rows
    const statsBlock = html.match(/class="card-text"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] || '';

    const getRow = (...labels) => {
      for (const label of labels) {
        const m = statsBlock.match(new RegExp(`${label}[^:]*:\\s*<\\/[^>]+>\\s*([^<]+)`, 'i'))
          || html.match(new RegExp(`>${label}:<\\/[^>]+>\\s*<[^>]+>([^<]+)<`, 'i'));
        if (m?.[1]?.trim()) return m[1].trim();
      }
      return null;
    };

    const cardType  = getRow('Type', 'Card Type');
    const colour    = getRow('Colour', 'Color');
    const cost      = getRow('Cost');
    const life      = getRow('Life');
    const power     = getRow('Power');
    const counter   = getRow('Counter');
    const attribute = getRow('Attribute');
    const rarity    = getRow('Rarity');

    // Build formatted type line: "Leader • Red/Yellow • 4 Life"
    let typeLine = null;
    const typeParts = [cardType, colour, cost ? `${cost} Cost` : (life ? `${life} Life` : null)].filter(Boolean);
    if (typeParts.length) typeLine = typeParts.join(' · ');

    // Build power line: "5000 Power · Special"
    let powerLine = null;
    const powerParts = [power ? `${power} Power` : null, attribute].filter(Boolean);
    if (powerParts.length) powerLine = powerParts.join(' · ');
    if (counter) powerLine = (powerLine ? powerLine + ' ' : '') + `· +${counter} Counter`;

    // ── Traits ────────────────────────────────────────────────
    const traitsMatch = html.match(/class="card-text-traits[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|span)>/i);
    const traits = traitsMatch ? clean(traitsMatch[1]) : null;

    // ── Effects ───────────────────────────────────────────────
    const effectMatches = [...html.matchAll(/class="card-text-section[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
    const effects = effectMatches
      .map(m => clean(m[1]))
      .filter(t => t && t.length > 5 && !t.match(/^(Illustrated|Block|Tournament|Latest|Deck)/i));

    // ── Rarity ────────────────────────────────────────────────
    const rarityRaw = rarity || html.match(/·\s*(SR|R|UC|C|SEC|SE|L|SP|TR|MR)\b/i)?.[1];
    const RMAP = { 'SECRET RARE':'SEC','SUPER RARE':'SR','RARE':'R','UNCOMMON':'UC',
      'COMMON':'C','LEADER':'L','SPECIAL':'SP','TREASURE RARE':'TR','MANGA RARE':'MR',
      'SEC':'SEC','SR':'SR','R':'R','UC':'UC','C':'C','L':'L','SP':'SP','TR':'TR','MR':'MR','SE':'SE' };
    const rarityCode = RMAP[(rarityRaw||'').trim().toUpperCase()] || rarityRaw?.trim() || null;

    // ── Image ─────────────────────────────────────────────────
    const imageUrl = html.match(/property="og:image"\s+content="([^"]+)"/i)?.[1] || fallbackImg;

    return res.status(200).json({
      name, rarity: rarityCode, setName,
      typeLine, powerLine, traits, effects, imageUrl
    });

  } catch(e) {
    return res.status(500).json({ error: e.message, name: null, rarity: null, setName: null, imageUrl: fallbackImg });
  }
}
