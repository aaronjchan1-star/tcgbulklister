/**
 * api/claude.js
 * Direct Claude AI pricing for all 4 games. Works within Vercel 10s limit.
 * For Pokemon, uses the real TCGplayer price as an anchor when available.
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
  const rarity    = card.variant?.label || card.rarity || '';
  const lang      = card.lang === 'Japanese' ? 'Japanese' : (card.lang || 'English');
  const isPlayset = card.listingType === 'playset';
  const qty       = card.qty || 1;
  const listingType = isPlayset ? 'playset of 4x' : qty > 1 ? `${qty}x lot` : 'single';
  const game      = card.game || 'onePiece';

  let prompt;

  if (game === 'pokemon') {
    const variant = card.variant || 'Normal';
    // If we have a real TCGplayer USD price, anchor to it
    const usdAnchor = card.tcgUsdPrice
      ? `\nTCGplayer US market price for this exact variant: US $${card.tcgUsdPrice.toFixed(2)} (multiply by ~1.5 for eBay AU AUD).`
      : '';
    prompt = `Price this Pokemon TCG card for eBay Australia (2025 market):

Card: ${name || number} (${number})
Set: ${card.setName || 'unknown'}
Rarity: ${rarity || 'unknown'}
Variant/Finish: ${variant}
Condition: Near Mint
Listing: ${listingType}${usdAnchor}

Variant pricing notes for eBay AU:
- Normal (non-holo) commons/uncommons: $1.00–2 AUD
- Reverse Holo commons/uncommons: $1.50–4 AUD
- Holo Rare: $2–8 AUD
- V / ex / GX: $3–20 AUD
- VMAX / VSTAR: $5–40 AUD
- Full Art / Alt Art / Special Illustration Rare: $20–300+ AUD
- Poke Ball pattern (151/Prismatic): $3–15 AUD typically
- Master Ball pattern (151/Prismatic): $40–400+ AUD — very rare, premium pricing
- Rainbow/Gold/Secret Rare: $15–150 AUD
- Playset (4x): ~3x single price

If a TCGplayer anchor price is given, weight it heavily (it's the real market). Master Ball and Poke Ball patterns trade well above the base card.

Reply ONLY with JSON:
{"price":0.00,"low":0.00,"mid":0.00,"high":0.00,"confidence":"high|medium|low","notes":"reason"}`;

  } else if (game === 'riftbound') {
    prompt = `Price this Riftbound (League of Legends TCG) card for eBay Australia (2026 market):

Card: ${name || number} (${number})
Rarity: ${rarity || 'Rare'}
Condition: Near Mint
Listing: ${listingType}

Riftbound launched in AU late 2025. eBay AU 2026 price guide:
- Common: $1.00 AUD
- Uncommon: $1.00–2 AUD
- Rare: $2–8 AUD (popular champions Jinx/Vi/Lux up to $15)
- Overnumbered (alt art): $8–40 AUD
- Ultimate Rare: $50–200+ AUD
- Playset (4x): ~3x single price

Reply ONLY with JSON:
{"price":0.00,"low":0.00,"mid":0.00,"high":0.00,"confidence":"high|medium|low","notes":"reason"}`;

  } else if (game === 'yugioh') {
    prompt = `Price this Yu-Gi-Oh! TCG card for eBay Australia (2025 market):

Card: ${name || number} (${number})
Rarity: ${rarity || 'Unknown'}
Language: ${lang}
Condition: Near Mint
Listing: ${listingType}

eBay AU Yu-Gi-Oh! price guide:
- Common: $1.00 AUD
- Rare: $1–3 AUD
- Super Rare: $2–8 AUD
- Ultra Rare: $3–15 AUD (meta cards to $50)
- Secret Rare: $5–30 AUD (meta to $150)
- Prismatic/Quarter Century Secret: $15–500+ AUD
- LOCR = Legacy of Chaos Reprint (Japanese)
- Japanese competitive staples carry a premium

Reply ONLY with JSON:
{"price":0.00,"low":0.00,"mid":0.00,"high":0.00,"confidence":"high|medium|low","notes":"reason"}`;

  } else {
    // One Piece
    const variant = rarity && !['SR','R','UC','C','L',''].includes(rarity) ? rarity : null;
    prompt = `Price this One Piece TCG card for eBay Australia (2025 market):

Card: ${name || number} (${number})
Rarity: ${rarity || 'SR'}${variant ? ` — ${variant} variant` : ' — standard version (NOT alt art/gold/manga/SEC)'}
Language: ${lang}
Condition: Near Mint
Listing: ${listingType}

eBay AU price ranges:
- C/UC: $1.00–2 AUD
- R: $1–5 AUD
- SR (popular Luffy/Zoro/Nami/Shanks): $8–25 AUD
- SR (others): $3–10 AUD
- SE/Special: $10–60 AUD
- SEC/Secret: $30–150 AUD
- Japanese: ~10–30% premium
- Playset (4x): ~3x single

Reply ONLY with JSON:
{"price":0.00,"low":0.00,"mid":0.00,"high":0.00,"confidence":"high|medium|low","notes":"reason"}`;
  }

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
