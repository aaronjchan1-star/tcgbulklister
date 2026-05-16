/**
 * api/yugioh.js
 * Fetches Yu-Gi-Oh! card details from YGOPRODeck API (free).
 * Accepts set codes like LOCR-JP001, POTE-EN001 etc.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'Missing number' });

  const num = number.toUpperCase().trim();

  try {
    // YGOPRODeck — search by card set code
    // The cardsets parameter accepts individual set codes like "LOCR-JP001"
    const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?cardsets=${encodeURIComponent(num)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'TCGBulkLister/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000)
    });

    if (resp.ok) {
      const json = await resp.json();
      const card = json.data?.[0];
      if (card) return res.status(200).json(formatYGO(card, num));
    }

    // Fallback: try searching by just the set prefix (e.g. LOCR-JP)
    const prefix = num.replace(/\d+$/, '');
    if (prefix !== num) {
      const resp2 = await fetch(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?cardsets=${encodeURIComponent(prefix)}`,
        { headers: { 'User-Agent': 'TCGBulkLister/1.0' }, signal: AbortSignal.timeout(8000) }
      );
      if (resp2.ok) {
        const json2 = await resp2.json();
        // Find the card with matching set code
        const match = json2.data?.find(c =>
          c.card_sets?.some(s => s.set_code.toUpperCase() === num)
        );
        if (match) return res.status(200).json(formatYGO(match, num));
      }
    }

    return res.status(404).json({ error: `Card not found: ${num}`, name: null });

  } catch(e) {
    return res.status(500).json({ error: e.message, name: null });
  }
}

function formatYGO(card, setCode) {
  // Find the matching set entry for rarity
  const setEntry = card.card_sets?.find(s => s.set_code.toUpperCase() === setCode)
    || card.card_sets?.[0];

  const RMAP = {
    'Common':'C','Rare':'R','Super Rare':'SR','Ultra Rare':'UR',
    'Secret Rare':'ScR','Prismatic Secret Rare':'PScR',
    'Quarter Century Secret Rare':'QCSR','Starlight Rare':'StR',
    'Ultimate Rare':'UtR','Ghost Rare':'GR','Collector\'s Rare':'CR',
    'Short Print':'SP','Super Short Print':'SSP'
  };
  const rarity = RMAP[setEntry?.set_rarity] || setEntry?.set_rarity || null;

  const typeParts = [];
  if (card.type)      typeParts.push(card.type);
  if (card.attribute) typeParts.push(card.attribute);
  if (card.race)      typeParts.push(card.race);
  const typeLine = typeParts.join(' · ') || null;

  const powerParts = [];
  if (card.level)              powerParts.push(`Level ${card.level}`);
  if (card.atk !== undefined)  powerParts.push(`ATK ${card.atk}`);
  if (card.def !== undefined)  powerParts.push(`DEF ${card.def}`);
  if (card.linkval)            powerParts.push(`Link-${card.linkval}`);
  const powerLine = powerParts.join(' / ') || null;

  // Language from set code
  const langCode = setCode.match(/-([A-Z]{2})\d/)?.[1];
  const lang = langCode === 'JP' ? 'Japanese'
    : langCode === 'KR' ? 'Korean'
    : langCode === 'AE' ? 'Asian-English'
    : 'English';

  return {
    name:     card.name,
    rarity,
    setName:  setEntry?.set_name || null,
    typeLine,
    powerLine,
    effects:  card.desc ? [card.desc] : null,
    imageUrl: card.card_images?.[0]?.image_url_small || card.card_images?.[0]?.image_url || null,
    lang
  };
}
