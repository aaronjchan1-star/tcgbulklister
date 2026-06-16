/**
 * api/smartprice.js
 * Combines eBay Browse API + Claude for accurate pricing.
 *
 * 1. eBay Browse API returns current AU listings (titles + prices) for the card
 * 2. Claude reads those listings and keeps ONLY the ones that match the exact
 *    card + variant (filtering out wrong variants, alt arts, graded, lots, wrong language)
 * 3. Claude returns a fair single-card market price based on the matching listings
 *
 * Needs env vars: EBAY_APP_ID, EBAY_CERT_ID, ANTHROPIC_API_KEY
 */

let cachedToken = null, tokenExpiry = 0;

async function getEbayToken(appId, certId) {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const creds = Buffer.from(`${appId}:${certId}`).toString('base64');
  const resp = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope')
  });
  if (!resp.ok) throw new Error(`eBay OAuth ${resp.status}`);
  const data = await resp.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { card } = req.body;
  if (!card) return res.status(400).json({ error: 'Missing card' });

  const appId  = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  const aiKey  = process.env.ANTHROPIC_API_KEY;
  if (!appId || !certId) return res.status(200).json({ configured: false, message: 'eBay not configured' });
  if (!aiKey) return res.status(500).json({ error: 'No Anthropic key' });

  const number  = (card.number || '').toUpperCase();
  const name    = card.name || '';
  const variant = typeof card.variant === 'string' ? card.variant : (card.variant?.label || '');
  const lang    = card.lang || 'English';
  const game    = card.game || 'onePiece';

  // Build search keywords per game
  let keywords;
  if (game === 'onePiece')      keywords = `${number} ${name} One Piece`;
  else if (game === 'pokemon')  keywords = `${name} ${card.printedNumber || number} Pokemon`;
  else if (game === 'riftbound') keywords = `${number} ${name} Riftbound`;
  else if (game === 'yugioh')   keywords = `${number} ${name} Yugioh`;
  else keywords = `${number} ${name}`;

  const CATEGORY = { onePiece:'183454', pokemon:'2536', riftbound:'183050', yugioh:'183454' };

  try {
    // ── 1. Get eBay AU active listings ──
    const token = await getEbayToken(appId, certId);
    const q = `${keywords} -PSA -BGS -CGC -ACE -graded -sealed -box`;
    const params = new URLSearchParams({
      q, limit: '50',
      filter: 'buyingOptions:{FIXED_PRICE},itemLocationCountry:AU',
      sort: 'price'
    });
    if (CATEGORY[game]) params.set('category_ids', CATEGORY[game]);

    const ebayResp = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU',
        'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=AU'
      }
    });
    if (!ebayResp.ok) throw new Error(`eBay Browse ${ebayResp.status}`);
    const ebayData = await ebayResp.json();

    const listings = (ebayData.itemSummaries || [])
      .map(it => ({
        title: it.title,
        price: parseFloat(it.price?.value),
        condition: it.condition || ''
      }))
      .filter(l => !isNaN(l.price) && l.price >= 0.5 && l.price < 10000)
      .slice(0, 40);

    if (!listings.length) {
      return res.status(200).json({ configured: true, found: 0, message: 'No AU listings found' });
    }

    // ── 2. Claude filters + prices ──
    const variantNote = variant && variant !== 'Normal'
      ? `This is specifically the ${variant} version.`
      : `This is the standard/base version — NOT alternate art, NOT a parallel/special rarity, NOT graded.`;

    const listingText = listings.map((l, i) => `${i+1}. $${l.price} [${l.condition}] ${l.title}`).join('\n');

    const prompt = `I'm pricing a single trading card for eBay Australia. Here are current eBay AU active listings from a keyword search — but many won't match my exact card.

MY CARD:
- Game: ${game}
- Number: ${number}
- Name: ${name}
- Variant: ${variant || 'standard'}
- Language: ${lang}
- ${variantNote}

EBAY AU LISTINGS (price, condition, title):
${listingText}

Task:
1. Identify which listings are the SAME card AND same variant as mine. Exclude: wrong card numbers, alternate/parallel arts (if mine is standard), graded/slabbed cards, multi-card lots or bundles, wrong language, and obviously mispriced outliers.
2. From only the MATCHING listings, work out a realistic SINGLE-CARD asking price for eBay AU.
3. Active asking prices run a bit above sold — set "price" to a competitive figure that would actually sell (slightly below the median of matches).

Reply ONLY with JSON:
{"price":0.00,"low":0.00,"high":0.00,"matches":0,"confidence":"high|medium|low","notes":"what you matched/excluded"}`;

    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': aiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
    });
    if (!aiResp.ok) throw new Error(`Claude ${aiResp.status}`);
    const aiData = await aiResp.json();
    const text = aiData.content?.[0]?.text || '';
    const result = JSON.parse((text.match(/\{[\s\S]*\}/) || ['{}'])[0]);

    return res.status(200).json({
      configured: true,
      found:      listings.length,
      perCardPrice: result.price || null,
      low:        result.low || null,
      high:       result.high || null,
      matches:    result.matches || 0,
      confidence: result.confidence || 'low',
      notes:      result.notes || '',
      source:     'ebay+claude'
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
