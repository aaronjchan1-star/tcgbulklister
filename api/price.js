/**
 * api/price.js
 * Vercel serverless function — proxies eBay Finding API server-side.
 * Filters out graded cards (PSA, BGS, CGC, ACE, HGA) from results.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { keywords, categoryId, appId } = req.query;

  if (!keywords || !categoryId || !appId) {
    return res.status(400).json({ error: 'Missing required params: keywords, categoryId, appId' });
  }

  const EBAY_SOLD_URL = `https://www.ebay.com.au/sch/i.html?LH_Sold=1&LH_Complete=1&_sacat=${categoryId}&_nkw=${encodeURIComponent(keywords + ' -PSA -BGS -CGC -graded -slab')}`;

  // Keep keywords clean for eBay search — graded filtering done server-side
  // Use broader search: remove language/variant modifiers that reduce results
  const findingUrl = [
    'https://svcs.ebay.com/services/search/FindingService/v1',
    '?OPERATION-NAME=findCompletedItems',
    '&SERVICE-VERSION=1.0.0',
    `&SECURITY-APPNAME=${encodeURIComponent(appId)}`,
    '&RESPONSE-DATA-FORMAT=JSON',
    `&keywords=${encodeURIComponent(keywords)}`,
    `&categoryId=${categoryId}`,
    '&itemFilter(0).name=SoldItemsOnly',
    '&itemFilter(0).value=true',
    '&sortOrder=EndTimeSoonest',
    '&paginationInput.entriesPerPage=20'
  ].join('');

  // Terms that indicate a graded card — filter these out of results even if
  // they slip through the keyword exclusion
  const GRADED_TERMS = ['psa', 'bgs', 'cgc', 'ace', 'hga', 'beckett', 'graded', 'slab', 'grade'];

  function isGraded(title) {
    const lower = title.toLowerCase();
    return GRADED_TERMS.some(term => {
      // Match whole words only to avoid false positives (e.g. "upgrade" contains "grade")
      const regex = new RegExp(`\\b${term}\\b`);
      return regex.test(lower);
    });
  }

  try {
    const response = await fetch(findingUrl);
    if (!response.ok) throw new Error(`eBay API returned ${response.status}`);

    const data = await response.json();
    const root = data?.findCompletedItemsResponse?.[0];
    const ack  = root?.ack?.[0];

    if (ack !== 'Success') {
      const msg = root?.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'eBay API error';
      return res.status(502).json({ error: msg, ebayUrl: EBAY_SOLD_URL });
    }

    const allItems = root?.searchResult?.[0]?.item || [];

    // Filter out graded cards
    const rawItems = allItems.filter(i => {
      const title = i?.title?.[0] || '';
      return !isGraded(title);
    });

    if (rawItems.length === 0) {
      return res.status(200).json({
        price:   null,
        count:   0,
        ebayUrl: EBAY_SOLD_URL,
        message: 'No recent ungraded AU sold listings found'
      });
    }

    const prices = rawItems
      .map(i => parseFloat(i?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__))
      .filter(p => !isNaN(p) && p > 0)
      .sort((a, b) => a - b);

    const median   = prices[Math.floor(prices.length / 2)];
    const lowest   = prices[0];
    const highest  = prices[prices.length - 1];
    const lastItem = rawItems[0];
    const lastTitle = lastItem?.title?.[0] || '';
    const lastDate  = lastItem?.listingInfo?.[0]?.endTime?.[0] || '';
    const soldDate  = lastDate ? new Date(lastDate).toLocaleDateString('en-AU') : '';

    return res.status(200).json({
      price: median,
      lowest,
      highest,
      count: prices.length,
      soldDate,
      lastTitle,
      ebayUrl: EBAY_SOLD_URL,
      filtered: allItems.length - rawItems.length // how many graded were excluded
    });

  } catch (err) {
    return res.status(500).json({ error: err.message, ebayUrl: EBAY_SOLD_URL });
  }
}
