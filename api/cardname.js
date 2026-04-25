/**
 * api/cardname.js
 * Fetches One Piece card details from Limitless TCG.
 * Returns: { name, rarity, setName, imageUrl }
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'Missing card number' });

  const num   = number.toUpperCase();
  const parts = num.split('-');
  const set   = parts[0];

  if (!set || !parts[1]) return res.status(400).json({ error: 'Invalid format' });

  // Scrape Limitless TCG card page for name, rarity, set name
  try {
    const url  = `https://onepiece.limitlesstcg.com/cards/en/${num}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'TCGBulkLister/1.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000)
    });

    if (resp.ok) {
      const html = await resp.text();

      // Extract card name — Limitless uses class="card-text-name"
      const nameMatch =
        html.match(/class="card-text-name"[^>]*>\s*([^<]+)/i) ||
        html.match(/property="og:title"\s+content="([^"]+)"/i) ||
        html.match(/<h1[^>]*>\s*([^<]+)/i);

      // Extract set name — appears in breadcrumb or set link
      const setMatch =
        html.match(/class="card-text-type[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ||
        html.match(/\/cards\/en\/[^"]+">([^<]+)<\/a>\s*<\/li>\s*<li[^>]*>\s*<a[^>]*>[^<]*<\/a>/i) ||
        html.match(/<a[^>]*href="\/cards\/en\/[a-z0-9-]+"[^>]*>([^<]+)<\/a>/i) ||
        html.match(/class="set-name[^"]*"[^>]*>([^<]+)</i);

      // Extract rarity
      const rarityMatch =
        html.match(/·\s*(SR|R|UC|C|SEC|SE|L|SP|TR|MR)\b/i) ||
        html.match(/\|\s*(Secret Rare|Super Rare|Rare|Uncommon|Common|Special|Leader|Treasure Rare|Manga Rare)\b/i);

      // Extract image
      const imgMatch =
        html.match(/property="og:image"\s+content="([^"]+)"/i) ||
        html.match(/class="card-image[^"]*"[^>]*>\s*<img[^>]*src="([^"]+)"/i);

      let name    = nameMatch?.[1]?.replace(/\s*[-|].*$/, '').trim() || null;
      let setName = null;
      let rarity  = null;
      let imgUrl  = imgMatch?.[1] || null;

      // Clean name
      if (name) name = name.replace(/\s*\([A-Z]{1,4}\d{1,2}.*/i, '').trim();

      // Parse set name — look for the set title on the page
      // Limitless shows set name in the breadcrumb nav and og:description
      const descMatch = html.match(/property="og:description"\s+content="([^"]+)"/i);
      if (descMatch) {
        // og:description often contains "Card from [Set Name]" or similar
        const descText = descMatch[1];
        const fromMatch = descText.match(/from\s+(.+?)(?:\.|,|$)/i);
        if (fromMatch) setName = fromMatch[1].trim();
      }

      // Try breadcrumb — typically: Home > Sets > [Set Name] > [Card]
      if (!setName) {
        const breadcrumbMatches = [...html.matchAll(/breadcrumb[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi)];
        // Set name is usually the second-to-last breadcrumb item
        if (breadcrumbMatches.length >= 2) {
          setName = breadcrumbMatches[breadcrumbMatches.length - 2]?.[1]?.trim();
        }
      }

      // Try page title pattern — "Card Name · Set Name · Limitless TCG"
      const titleMatch = html.match(/<title>([^|<]+)\s*[·|]\s*([^|<·]+)\s*[·|]/i);
      if (!setName && titleMatch?.[2]) {
        const candidate = titleMatch[2].trim();
        if (candidate && !candidate.toLowerCase().includes('limitless')) {
          setName = candidate;
        }
      }

      // Parse rarity
      if (rarityMatch) {
        const raw = (rarityMatch[1] || '').trim().toUpperCase();
        const rarityMap = {
          'SECRET RARE': 'SEC', 'SUPER RARE': 'SR', 'RARE': 'R',
          'UNCOMMON': 'UC', 'COMMON': 'C', 'LEADER': 'L',
          'TREASURE RARE': 'TR', 'MANGA RARE': 'MR', 'SPECIAL': 'SP',
          'SEC': 'SEC', 'SR': 'SR', 'R': 'R', 'UC': 'UC',
          'C': 'C', 'L': 'L', 'TR': 'TR', 'MR': 'MR', 'SP': 'SP', 'SE': 'SE'
        };
        rarity = rarityMap[raw] || raw;
      }

      // Fallback image URL using Limitless CDN
      if (!imgUrl) {
        imgUrl = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${set}/${num}_EN.webp`;
      }

      if (name) {
        return res.status(200).json({
          name,
          rarity:   rarity || null,
          setName:  setName || null,
          imageUrl: imgUrl
        });
      }
    }
  } catch(e) {
    console.log('Limitless scrape failed:', e.message);
  }

  // Fallback: TCGdex
  try {
    const r = await fetch(`https://api.tcgdex.net/v2/en/cards/${num}`, {
      signal: AbortSignal.timeout(4000)
    });
    if (r.ok) {
      const data = await r.json();
      if (data?.name) {
        return res.status(200).json({
          name:     data.name,
          rarity:   data.rarity || null,
          setName:  data.set?.name || null,
          imageUrl: `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${set}/${num}_EN.webp`
        });
      }
    }
  } catch(e) {}

  return res.status(200).json({
    name:     null,
    rarity:   null,
    setName:  null,
    imageUrl: `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${set}/${num}_EN.webp`
  });
}
