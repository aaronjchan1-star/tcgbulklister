/**
 * api/claude.js
 * Pricing pipeline:
 * 1. Scrape eBay AU sold listings for this specific card + listing type
 * 2. Analyse prices intelligently (singles vs playsets vs lots)
 * 3. Fall back to Claude AI if no eBay data found
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { card } = req.body;
  if (!card) return res.status(400).json({ error: 'Missing card data' });

  // ── Step 1: Scrape eBay AU sold listings ──────────────────
  try {
    const result = await scrapeEbayAU(card);
    if (result) return res.status(200).json(result);
  } catch(e) {
    console.log('eBay scrape failed:', e.message);
  }

  // ── Step 2: Fall back to Claude AI ────────────────────────
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'API key not configured' });

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: buildClaudePrompt(card) }]
      })
    });

    if (!resp.ok) throw new Error(`Anthropic ${resp.status}`);
    const data   = await resp.json();
    const text   = data.content?.[0]?.text || '';
    const result = parseJSON(text);
    result.source = 'claude';
    return res.status(200).json(result);
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}

/* ─── eBay AU scraper ─────────────────────────────────── */
async function scrapeEbayAU(card) {
  const name    = card.name && card.name !== card.number ? card.name : '';
  const number  = card.number.toUpperCase();
  const isLot   = card.listingType === 'lot';
  const isPset  = card.listingType === 'playset';
  const qty     = card.qty || 1;
  const lang    = card.lang === 'Japanese' ? 'Japanese' : '';

  // Build targeted search query
  let query;
  if (isPset) {
    // Search for playsets of this card
    query = `${number} ${name} One Piece playset 4x -PSA -BGS -CGC -graded`;
  } else if (isLot && qty > 1) {
    // Search for matching lot size
    query = `${qty}x ${number} ${name} One Piece -PSA -BGS -CGC -graded`;
  } else {
    // Single card search
    query = `${number} ${name} ${lang} One Piece -PSA -BGS -CGC -graded -playset -lot`.trim();
  }

  // Search eBay AU sold listings — AU sellers only (LH_PrefLoc=1), sorted by recent (sop=13)
  const url = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_sop=13&LH_PrefLoc=1&_ipg=60`;

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-AU,en;q=0.9',
      'Accept': 'text/html'
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!resp.ok) throw new Error(`eBay ${resp.status}`);
  const html = await resp.text();

  // Extract all sold prices
  const prices = extractPrices(html, card);
  if (prices.length === 0) return null;

  // Filter to relevant price range — remove extreme outliers
  const sorted  = [...prices].sort((a, b) => a - b);
  const q1      = sorted[Math.floor(sorted.length * 0.25)];
  const q3      = sorted[Math.floor(sorted.length * 0.75)];
  const iqr     = q3 - q1;
  const filtered = sorted.filter(p => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);
  const relevant = filtered.length >= 2 ? filtered : sorted;

  const median = relevant[Math.floor(relevant.length / 2)];
  const low    = relevant[0];
  const high   = relevant[relevant.length - 1];
  const avg    = relevant.reduce((a, b) => a + b, 0) / relevant.length;

  // Use slightly above median to account for current market vs sold prices
  // (sold prices are slightly below what you'd list at)
  const recommended = Math.round((median * 1.05) * 100) / 100;

  return {
    price:      recommended,
    low:        Math.round(low * 100) / 100,
    mid:        Math.round(median * 100) / 100,
    high:       Math.round(high * 100) / 100,
    count:      prices.length,
    confidence: prices.length >= 5 ? 'high' : prices.length >= 3 ? 'medium' : 'low',
    notes:      `${prices.length} eBay AU sold listing${prices.length !== 1 ? 's' : ''} · median $${median.toFixed(2)} · recommended $${recommended.toFixed(2)}`,
    source:     'ebay-au'
  };
}

function extractPrices(html, card) {
  const prices = [];
  const isPset = card.listingType === 'playset';
  const qty    = card.qty || 1;

  // eBay AU prices appear as "AU $12.50" in sold listings
  const priceRegex = /AU \$(\d+(?:\.\d{1,2})?)/g;
  let match;
  while ((match = priceRegex.exec(html)) !== null) {
    const price = parseFloat(match[1]);
    // Filter to sensible TCG card price range
    if (price < 0.50 || price > 5000) continue;

    // For singles, exclude suspiciously high prices that are likely lots/playsets
    if (!isPset && qty === 1 && price > 500) continue;

    // For playsets, exclude very low prices that are likely singles
    if (isPset && price < 3) continue;

    prices.push(price);
  }

  return [...new Set(prices)]; // deduplicate
}

/* ─── Claude fallback ─────────────────────────────────── */
function buildClaudePrompt(card) {
  const isLot  = card.listingType === 'lot';
  const isPset = card.listingType === 'playset';
  const qty    = card.qty || 1;

  const listingDesc = isPset
    ? `a playset (4x copies bundled together)`
    : isLot && qty > 1
      ? `a ${qty}x lot (${qty} copies bundled together)`
      : `a single card`;

  return `You are a One Piece TCG pricing expert for eBay Australia in 2025.

Estimate the current eBay AU selling price for ${listingDesc}:
- Card: ${card.name || card.number}
- Number: ${card.number}
- Language: ${card.lang}
- Condition: ${card.cond}
- Rarity: ${card.variant?.label || 'SR'}

eBay AU 2025 market context:
- Most SR singles: $3–$15 AUD
- Popular SR singles (Luffy/Zoro/Shanks): $8–$25 AUD
- R singles: $1–$5 AUD, UC: $0.50–$2 AUD, C: $0.50–$1 AUD
- Playsets (4x): roughly 3–3.5x the single price (discount for bulk)
- 2x lots: roughly 1.8–2x single price
- 3x lots: roughly 2.5–3x single price
- Price conservatively — you're competing with many sellers

Respond ONLY with valid JSON:
{"low": 0.00, "mid": 0.00, "high": 0.00, "confidence": "low", "notes": "one sentence"}`;
}

function parseJSON(text) {
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    const m = text.match(/\{[\s\S]*?\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Parse failed');
  }
}
