/**
 * api/yugioh.js
 * Fetches Yu-Gi-Oh! card details from YGOPRODeck.
 * Looks a card up by its printed SET CODE (e.g. LOCR-JP001) using the
 * cardsetsinfo endpoint — the cardinfo endpoint cannot search by set code,
 * which is why set-code lookups were previously returning nothing.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'Missing number', name: null });
  const num = number.toUpperCase().trim();

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function getJson(url) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'TCGBulkLister/1.0', 'Accept': 'application/json' },
          signal: AbortSignal.timeout(8000)
        });
        if (r.ok) return await r.json();
        if ([429, 500, 502, 503, 504].includes(r.status) && attempt < 2) { await sleep(400 * (attempt + 1)); continue; }
        return null;
      } catch { if (attempt < 2) { await sleep(400 * (attempt + 1)); continue; } }
    }
    return null;
  }

  try {
    // Step 1 — resolve the exact printing by set code
    const setInfo = await getJson(`https://db.ygoprodeck.com/api/v7/cardsetsinfo.php?setcode=${encodeURIComponent(num)}`);
    if (!setInfo || setInfo.error || !setInfo.name) {
      return res.status(200).json({ error: `Card not found: ${num}`, name: null });
    }

    // Step 2 — fetch full card details (image, type, ATK/DEF) by id
    let card = null;
    if (setInfo.id) {
      const full = await getJson(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${encodeURIComponent(setInfo.id)}`);
      card = full?.data?.[0] || null;
    }

    return res.status(200).json(formatYGO(card, setInfo, num));
  } catch (e) {
    return res.status(200).json({ error: e.message, name: null });
  }
}

function formatYGO(card, setInfo, setCode) {
  const RMAP = {
    'Common':'C','Short Print':'C','Super Short Print':'C','Rare':'R','Super Rare':'SR',
    'Ultra Rare':'UR','Ultimate Rare':'UtR','Secret Rare':'ScR','Prismatic Secret Rare':'PScR',
    'Ultra Secret Rare':'UScR','Secret Ultra Rare':'ScR','Quarter Century Secret Rare':'QCSR',
    'Starlight Rare':'StR','Ghost Rare':'GR',"Collector's Rare":'CR','Gold Rare':'GUR',
    'Platinum Rare':'PlR','Mosaic Rare':'MSR'
  };
  const rawRarity = setInfo.set_rarity || null;
  const rarity = rawRarity ? (RMAP[rawRarity] || rawRarity) : null;

  const typeParts = [];
  if (card?.type)      typeParts.push(card.type);
  if (card?.attribute) typeParts.push(card.attribute);
  if (card?.race)      typeParts.push(card.race);
  const typeLine = typeParts.join(' · ') || null;

  const powerParts = [];
  if (card?.level)             powerParts.push(`Level ${card.level}`);
  if (card?.atk !== undefined) powerParts.push(`ATK ${card.atk}`);
  if (card?.def !== undefined) powerParts.push(`DEF ${card.def}`);
  if (card?.linkval)           powerParts.push(`Link-${card.linkval}`);
  const powerLine = powerParts.join(' / ') || null;

  const langCode = setCode.match(/-([A-Z]{2})\d/)?.[1];
  const lang = langCode === 'JP' ? 'Japanese'
    : langCode === 'KR' ? 'Korean'
    : langCode === 'AE' ? 'Asian-English'
    : 'English';

  return {
    name:     setInfo.name || card?.name || null,
    rarity,
    setName:  setInfo.set_name || null,
    typeLine,
    powerLine,
    effects:  card?.desc ? [card.desc] : null,
    imageUrl: card?.card_images?.[0]?.image_url_small || card?.card_images?.[0]?.image_url || null,
    lang
  };
}
