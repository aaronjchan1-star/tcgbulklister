/**
 * api/gundam.js
 * Fetches Gundam Card Game details from the free gcgapi.com REST API.
 * Looks a card up by its printed number (e.g. GD01-068). Retries transient
 * errors and supports an optional GUNDAM_API_KEY for a higher rate limit.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'Missing number', name: null });
  const num = number.toUpperCase().trim();

  const key = process.env.GUNDAM_API_KEY;
  const headers = { 'Accept': 'application/json', 'User-Agent': 'TCGBulkLister/1.0' };
  if (key) headers['X-API-Key'] = key;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  try {
    let card = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`https://api.gcgapi.com/v1/cards/${encodeURIComponent(num)}`, {
          headers, signal: AbortSignal.timeout(8000)
        });
        if (r.ok) {
          const json = await r.json();
          // /v1/cards/{id} returns the card object (sometimes under .data)
          card = json?.card_number ? json : (json?.data?.[0] || json?.data || null);
          break;
        }
        if ([429, 500, 502, 503, 504].includes(r.status) && attempt < 2) { await sleep(400 * (attempt + 1)); continue; }
        break;
      } catch { if (attempt < 2) { await sleep(400 * (attempt + 1)); continue; } }
    }

    if (!card || !card.name) return res.status(200).json({ error: `Card not found: ${num}`, name: null });

    // Rarity: keep the API string; the client normalises it to the dropdown
    const typeParts = [];
    if (card.card_type) typeParts.push(card.card_type);
    if (card.color)     typeParts.push(card.color);
    if (card.trait)     typeParts.push(card.trait);
    const typeLine = typeParts.join(' · ') || null;

    const powerParts = [];
    if (card.level != null) powerParts.push(`Lv.${card.level}`);
    if (card.cost != null)  powerParts.push(`Cost ${card.cost}`);
    if (card.ap != null)    powerParts.push(`AP ${card.ap}`);
    if (card.hp != null)    powerParts.push(`HP ${card.hp}`);
    const powerLine = powerParts.join(' / ') || null;

    return res.status(200).json({
      name:     card.name,
      rarity:   card.rarity || null,
      setName:  card.set_name || null,
      setCode:  card.set_code || null,
      typeLine,
      powerLine,
      imageUrl: card.image_url || null
    });
  } catch (e) {
    return res.status(200).json({ error: e.message, name: null });
  }
}
