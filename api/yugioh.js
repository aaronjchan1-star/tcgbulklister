/**
 * api/yugioh.js
 * Fetches Yu-Gi-Oh! card details from YGOPRODeck API (free, no key needed).
 * Supports card number lookup e.g. LOCR-JP001
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'Missing number' });

  const num = number.toUpperCase().trim();

  try {
    // YGOPRODeck API: search by card set code
    const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?cardsets=${encodeURIComponent(num)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'TCGBulkLister/1.0' },
      signal: AbortSignal.timeout(8000)
    });

    if (!resp.ok) throw new Error(`API ${resp.status}`);
    const data = await resp.json();

    // Find the card matching this set code
    const card = data.data?.[0];
    if (!card) return res.status(404).json({ error: 'Card not found' });

    // Find this specific set entry for rarity info
    const setEntry = card.card_sets?.find(s =>
      s.set_code.toUpperCase() === num
    ) || card.card_sets?.[0];

    // Build type line like "Effect Monster · DARK · Warrior"
    const typeParts = [];
    if (card.type)      typeParts.push(card.type.replace(' Monster', ' Monster'));
    if (card.attribute) typeParts.push(card.attribute);
    if (card.race)      typeParts.push(card.race);
    const typeLine = typeParts.join(' · ');

    // Build power line: "ATK 2500 / DEF 2100" or "Level 7"
    const powerParts = [];
    if (card.level)     powerParts.push(`Level ${card.level}`);
    if (card.atk !== undefined) powerParts.push(`ATK ${card.atk}`);
    if (card.def !== undefined) powerParts.push(`DEF ${card.def}`);
    if (card.linkval)   powerParts.push(`Link-${card.linkval}`);
    const powerLine = powerParts.join(' / ');

    // Set name
    const setName = setEntry?.set_name || null;

    // Rarity
    const rarityRaw = setEntry?.set_rarity || null;
    const RMAP = {
      'Common': 'C', 'Rare': 'R', 'Super Rare': 'SR', 'Ultra Rare': 'UR',
      'Secret Rare': 'ScR', 'Prismatic Secret Rare': 'PScR',
      'Quarter Century Secret Rare': 'QCSR', 'Starlight Rare': 'StR',
      'Ultimate Rare': 'UtR', 'Ghost Rare': 'GR',
      'Collector\'s Rare': 'CR', 'Platinum Secret Rare': 'PlScR',
      'Short Print': 'SP', 'Super Short Print': 'SSP'
    };
    const rarity = RMAP[rarityRaw] || rarityRaw || null;

    // Image — YGOPRODeck provides image URLs directly
    const imageUrl = card.card_images?.[0]?.image_url_small
      || card.card_images?.[0]?.image_url
      || null;

    // Determine language from set code (e.g. JP = Japanese, EN = English)
    const langMatch = num.match(/-([A-Z]{2})\d/);
    const lang = langMatch?.[1] === 'JP' ? 'Japanese'
      : langMatch?.[1] === 'KR' ? 'Korean'
      : langMatch?.[1] === 'AE' ? 'Asian-English'
      : 'English';

    return res.status(200).json({
      name:     card.name,
      rarity,
      setName,
      typeLine: typeLine || null,
      powerLine: powerLine || null,
      effects:  card.desc ? [card.desc] : null,
      imageUrl,
      lang
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
