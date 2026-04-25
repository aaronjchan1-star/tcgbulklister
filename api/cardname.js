/**
 * api/cardname.js
 * Fetches One Piece card details (name, rarity, image) from Limitless TCG.
 * Returns: { name, rarity, imageUrl }
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'Missing card number' });

  const num = number.toUpperCase();
  const parts = num.split('-');
  const set   = parts[0];
  const cardNum = parts[1];

  if (!set || !cardNum) return res.status(400).json({ error: 'Invalid format' });

  // Try Limitless TCG card page — scrape name + rarity
  try {
    const url = `https://onepiece.limitlesstcg.com/cards/en/${num}`;
    const res1 = await fetch(url, {
      headers: { 'User-Agent': 'TCGBulkLister/1.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(6000)
    });

    if (res1.ok) {
      const html = await res1.text();

      // Extract card name
      const nameMatch = html.match(/class="card-text-name"[^>]*>\s*([^<]+)/i)
        || html.match(/<h1[^>]*>\s*([^<]+)/i)
        || html.match(/property="og:title"\s+content="([^"]+)"/i);

      // Extract rarity
      const rarityMatch = html.match(/class="card-text-type[^"]*"[^>]*>[^<]*<\/[^>]+>\s*([^<·]+)·\s*([A-Z]+)/i)
        || html.match(/·\s*(SR|R|UC|C|SEC|SE|L|SP)\b/i)
        || html.match(/\b(Secret Rare|Super Rare|Rare|Uncommon|Common|Special)\b/i);

      // Extract image URL
      const imgMatch = html.match(/class="card-image[^"]*"[^>]*>\s*<img[^>]*src="([^"]+)"/i)
        || html.match(/property="og:image"\s+content="([^"]+)"/i);

      let name   = nameMatch?.[1]?.replace(/\s*[-|].*$/, '').trim() || null;
      let rarity = null;
      let imgUrl = imgMatch?.[1] || null;

      // Parse rarity from matched text
      if (rarityMatch) {
        const raw = (rarityMatch[2] || rarityMatch[1] || '').toUpperCase().trim();
        if (raw.includes('SECRET') || raw === 'SEC') rarity = 'SEC';
        else if (raw.includes('SUPER') || raw === 'SR') rarity = 'SR';
        else if (raw === 'R' || raw.includes('RARE')) rarity = 'R';
        else if (raw === 'UC' || raw.includes('UNCOMMON')) rarity = 'UC';
        else if (raw === 'C' || raw.includes('COMMON')) rarity = 'C';
        else if (raw === 'L' || raw.includes('LEADER')) rarity = 'L';
        else if (raw === 'SP') rarity = 'SP';
        else rarity = raw;
      }

      // Build Limitless CDN image URL as fallback
      if (!imgUrl) {
        imgUrl = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${set}/${num}_EN.webp`;
      }

      // Clean name — remove set code suffixes
      if (name) name = name.replace(/\s*\([A-Z]{1,4}\d{1,2}.*/i, '').trim();

      if (name) {
        return res.status(200).json({ name, rarity: rarity || 'SR', imageUrl: imgUrl });
      }
    }
  } catch(e) {
    console.log('Limitless page scrape failed:', e.message);
  }

  // Fallback: TCGdex
  try {
    const r = await fetch(`https://api.tcgdex.net/v2/en/cards/${num}`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const data = await r.json();
      if (data?.name) {
        return res.status(200).json({
          name:     data.name,
          rarity:   data.rarity || 'SR',
          imageUrl: `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${set}/${num}_EN.webp`
        });
      }
    }
  } catch(e) {}

  // Last resort — just return the CDN image URL with no name
  return res.status(200).json({
    name:     null,
    rarity:   null,
    imageUrl: `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${set}/${num}_EN.webp`
  });
}
