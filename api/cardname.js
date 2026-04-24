/**
 * api/cardname.js
 * Fetches One Piece card name from Limitless TCG server-side (avoids CORS).
 * Query params: number=OP01-060
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'Missing card number' });

  const parts  = number.toUpperCase().split('-');
  const set    = parts[0];
  const num    = parts[1];

  if (!set || !num) return res.status(400).json({ error: 'Invalid card number format' });

  // Try Limitless TCG API first
  try {
    const url  = `https://onepiece.limitlesstcg.com/api/search?cards=true&set=${set}&number=${num}`;
    const res1 = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'TCGBulkLister/1.0' }
    });

    if (res1.ok) {
      const data = await res1.json();
      // Limitless returns array or object with cards
      const cards = Array.isArray(data) ? data : (data.cards || data.results || []);
      const card  = cards.find(c =>
        c.number?.toUpperCase() === num ||
        c.id?.toUpperCase() === number.toUpperCase()
      ) || cards[0];

      if (card?.name) {
        return res.status(200).json({ name: card.name, source: 'limitless' });
      }
    }
  } catch(e) { /* fall through to next source */ }

  // Try Limitless card page directly and scrape the name
  try {
    const url  = `https://onepiece.limitlesstcg.com/cards/en/${number.toUpperCase()}`;
    const res2 = await fetch(url, {
      headers: { 'User-Agent': 'TCGBulkLister/1.0' }
    });

    if (res2.ok) {
      const html = await res2.text();
      // Extract card name from page title or heading
      const titleMatch = html.match(/<title>([^|<]+)/i);
      const h1Match    = html.match(/<h1[^>]*>([^<]+)</i);
      const metaMatch  = html.match(/property="og:title"\s+content="([^"]+)"/i);

      const raw = metaMatch?.[1] || h1Match?.[1] || titleMatch?.[1] || '';
      // Clean up — remove " - Limitless TCG" suffix etc
      const name = raw.replace(/\s*[-|].*$/, '').trim();
      if (name && name.length > 0 && !name.toLowerCase().includes('limitless')) {
        return res.status(200).json({ name, source: 'limitless-page' });
      }
    }
  } catch(e) { /* fall through */ }

  // Try TCGdex as fallback
  try {
    const url  = `https://api.tcgdex.net/v2/en/cards/${number.toUpperCase()}`;
    const res3 = await fetch(url);
    if (res3.ok) {
      const data = await res3.json();
      if (data?.name) return res.status(200).json({ name: data.name, source: 'tcgdex' });
    }
  } catch(e) { /* give up */ }

  return res.status(404).json({ error: 'Card name not found' });
}
