/**
 * api/ebaymarket.js
 * Checks current eBay AU market price for a card via the Browse API (active listings).
 * Returns median/avg/low/high asking price + a sold-price estimate.
 *
 * Setup (one-time): add these Vercel env vars from your eBay developer account:
 *   EBAY_APP_ID   = your App ID (Client ID)
 *   EBAY_CERT_ID  = your Cert ID (Client Secret)
 * Get them at https://developer.ebay.com → Application Keys (Production).
 *
 * Note: Browse API returns ACTIVE listings (asking prices), not sold prices.
 * eBay's sold-data API (Marketplace Insights) is gated to approved partners only.
 */

let cachedToken = null;
let tokenExpiry = 0;

async function getToken(appId, certId) {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const creds = Buffer.from(`${appId}:${certId}`).toString('base64');
  const resp = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${creds}`
    },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope')
  });
  if (!resp.ok) throw new Error(`OAuth ${resp.status}: ${(await resp.text()).slice(0,120)}`);
  const data = await resp.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const appId  = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) {
    return res.status(200).json({ configured: false, message: 'eBay market check not configured' });
  }

  const { keywords, categoryId } = req.query;
  if (!keywords) return res.status(400).json({ error: 'Missing keywords' });

  try {
    const token = await getToken(appId, certId);

    // Exclude graded cards & sealed product from the comp
    const q = `${keywords} -PSA -BGS -CGC -ACE -graded -sealed -booster -box`;
    const params = new URLSearchParams({
      q,
      limit: '50',
      filter: 'buyingOptions:{FIXED_PRICE},itemLocationCountry:AU,conditions:{USED|NEW}',
      sort: 'price'
    });
    if (categoryId) params.set('category_ids', categoryId);

    const resp = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU',
        'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=AU'
      }
    });

    if (!resp.ok) throw new Error(`Browse ${resp.status}: ${(await resp.text()).slice(0,120)}`);
    const data = await resp.json();

    const items = data.itemSummaries || [];
    // Extract prices (item price only, AUD)
    const prices = items
      .map(it => parseFloat(it.price?.value))
      .filter(p => !isNaN(p) && p >= 0.5 && p < 10000)
      .sort((a, b) => a - b);

    if (!prices.length) {
      return res.status(200).json({ configured: true, found: 0, message: 'No active AU listings found' });
    }

    // Trim outliers (drop top & bottom 10%) for a robust median
    const trim = Math.floor(prices.length * 0.1);
    const core = prices.slice(trim, prices.length - trim || prices.length);
    const median = core[Math.floor(core.length / 2)];
    const avg    = core.reduce((s, p) => s + p, 0) / core.length;
    const low    = prices[0];
    const high   = prices[prices.length - 1];

    // Active asking prices typically run ~15% above actual sold; estimate sold
    const soldEstimate = median * 0.85;

    return res.status(200).json({
      configured: true,
      found:       prices.length,
      activeMedian: round(median),
      activeAvg:    round(avg),
      activeLow:    round(low),
      activeHigh:   round(high),
      soldEstimate: round(soldEstimate),
      note: 'Active listings (asking prices). Sold estimate = median × 0.85.'
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}

function round(n) { return Math.round(n * 100) / 100; }
