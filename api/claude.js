/**
 * api/claude.js
 * Direct Claude AI pricing — no web search tool, works within Vercel 10s limit.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { card } = req.body;
  if (!card) return res.status(400).json({ error: 'Missing card' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'No API key' });

  const name      = card.name && card.name !== card.number ? card.name : '';
  const number    = card.number.toUpperCase();
  const variant   = card.variant?.label && !['Standard','SR','R','UC','C','L',''].includes(card.variant.label)
    ? card.variant.label : null;
  const rarity    = card.variant?.label || 'SR';
  const lang      = card.lang === 'Japanese' ? 'Japanese' : 'English';
  const isPlayset = card.listingType === 'playset';
  const qty       = card.qty || 1;
  const listingType = isPlayset ? 'playset of 4x' : qty > 1 ? `${qty}x lot` : 'single';

  const prompt = `Price this One Piece TCG card for eBay Australia (2025 market):

Card: ${name || number} (${number})
Rarity: ${rarity}${variant ? ` — ${variant} variant specifically` : ' — standard version (NOT alternate art, gold, manga rare, SEC)'}
Language: ${lang}
Condition: Near Mint
Listing: ${listingType}

eBay AU 2025 price ranges:
- C/UC: $1.00–2 AUD each (minimum $1.00 — eBay AU floor)
- R: $1.00–5 AUD each  
- SR (popular chars Luffy/Zoro/Nami/Shanks): $8–25 AUD
- SR (others): $3–10 AUD
- SE/Special: $10–60 AUD
- SEC/Secret: $30–150 AUD
- Gold/Manga Rare: significant premium
- Japanese: ~10–30% premium
- Playset (4x): ~3x single price
- Lots: proportional discount

Be specific to this card's character and playability.

Reply ONLY with JSON:
{"price":0.00,"low":0.00,"mid":0.00,"high":0.00,"confidence":"high|medium|low","notes":"reason"}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 200, messages: [{ role: 'user', content: prompt }] })
    });

    if (!resp.ok) throw new Error(`API ${resp.status}: ${(await resp.text()).slice(0,100)}`);
    const data = await resp.json();
    const text = data.content?.[0]?.text || '';
    const result = JSON.parse((text.match(/\{[\s\S]*\}/) || ['{}'])[0]);
    result.source = 'claude';
    if (!result.price && result.mid) result.price = result.mid;
    return res.status(200).json(result);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
