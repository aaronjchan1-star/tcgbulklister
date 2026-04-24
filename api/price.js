/**
 * api/price.js
 * Returns a direct eBay AU sold listings search URL for the card.
 * The eBay findCompletedItems API was decommissioned Feb 2025.
 * This endpoint now just builds and returns the correct eBay search URL.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { keywords, categoryId } = req.query;
  if (!keywords) return res.status(400).json({ error: 'Missing keywords' });

  // Exclude graded cards from the search URL itself
  const cleanKeywords = `${keywords} -PSA -BGS -CGC -ACE -HGA -graded -slab`;
  const ebayUrl = `https://www.ebay.com.au/sch/i.html?LH_Sold=1&LH_Complete=1&_sacat=${categoryId || 0}&_nkw=${encodeURIComponent(cleanKeywords)}&_sop=13`;

  return res.status(200).json({ ebayUrl, price: null, message: 'manual' });
}
