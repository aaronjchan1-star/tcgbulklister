/**
 * api/price.js
 * Vercel serverless function — proxies eBay Finding API server-side.
 * No CORS issues since this runs on the server, not in the browser.
 *
 * Query params:
 *   keywords    — search string (e.g. "OP05-119 One Piece card")
 *   categoryId  — eBay category (183454 = One Piece TCG, 2536 = Pokémon TCG)
 *   appId       — eBay Production App ID (Client ID)
 */

export default async function handler(req, res) {
  // Allow requests from any origin (your GitHub Pages site)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { keywords, categoryId, appId } = req.query;

  if (!keywords || !categoryId || !appId) {
    return res.status(400).json({ error: 'Missing required params: keywords, categoryId, appId' });
  }

  const FINDING_ENDPOINT = 'https://svcs.ebay.com/services/search/FindingService/v1';
  const EBAY_SOLD_URL    = `https://www.ebay.com.au/sch/i.html?LH_Sold=1&LH_Complete=1&_sacat=${categoryId}&_nkw=${encodeURIComponent(keywords)}`;

  const findingUrl = [
    FINDING_ENDPOINT,
    '?OPERATION-NAME=findCompletedItems',
    '&SERVICE-VERSION=1.0.0',
    `&SECURITY-APPNAME=${encodeURIComponent(appId)}`,
    '&RESPONSE-DATA-FORMAT=JSON',
    `&keywords=${encodeURIComponent(keywords)}`,
    `&categoryId=${categoryId}`,
    '&itemFilter(0).name=SoldItemsOnly',
    '&itemFilter(0).value=true',
    '&itemFilter(1).name=Currency',
    '&itemFilter(1).value=AUD',
    '&sortOrder=EndTimeSoonest',
    '&paginationInput.entriesPerPage=10'
  ].join('');

  try {
    const response = await fetch(findingUrl);

    if (!response.ok) {
      throw new Error(`eBay API returned ${response.status}`);
    }

    const data = await response.json();
    const root = data?.findCompletedItemsResponse?.[0];
    const ack  = root?.ack?.[0];

    if (ack !== 'Success') {
      const msg = root?.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'eBay API error';
      return res.status(502).json({ error: msg, ebayUrl: EBAY_SOLD_URL });
    }

    const items = root?.searchResult?.[0]?.item || [];

    if (items.length === 0) {
      return res.status(200).json({
        price:    null,
        count:    0,
        ebayUrl:  EBAY_SOLD_URL,
        message:  'No recent AU sold listings found'
      });
    }

    const prices = items
      .map(i => parseFloat(i?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__))
      .filter(p => !isNaN(p) && p > 0)
      .sort((a, b) => a - b);

    const median    = prices[Math.floor(prices.length / 2)];
    const lowest    = prices[0];
    const highest   = prices[prices.length - 1];
    const lastTitle = items[0]?.title?.[0] || '';
    const lastDate  = items[0]?.listingInfo?.[0]?.endTime?.[0] || '';
    const soldDate  = lastDate ? new Date(lastDate).toLocaleDateString('en-AU') : '';

    return res.status(200).json({
      price:     median,
      lowest,
      highest,
      count:     prices.length,
      soldDate,
      lastTitle,
      ebayUrl:   EBAY_SOLD_URL
    });

  } catch (err) {
    return res.status(500).json({
      error:   err.message,
      ebayUrl: EBAY_SOLD_URL
    });
  }
}
