/**
 * api/claude.js
 * Pricing pipeline:
 * 1. Scrape eBay AU completed/sold listings (real AU market prices)
 * 2. Fall back to Claude AI if scraping fails or returns no results
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
    const ebayPrice = await scrapeEbayAUSold(card);
    if (ebayPrice) return res.status(200).json(ebayPrice);
  } catch(e) {
    console.log('eBay scrape failed, falling back to Claude:', e.message);
  }

  // ── Step 2: Fall back to Claude AI ────────────────────────
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 200,
        messages: [{ role: 'user', content: buildClaudePrompt(card) }]
      })
    });

    if (!response.ok) throw new Error(`Anthropic API error ${response.status}`);
    const data   = await response.json();
    const text   = data.content?.[0]?.text || '';
    const result = parseJSON(text);
    result.source = 'claude';
    return res.status(200).json(result);

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}

/* ─── eBay AU sold listing scraper ─────────────────────────── */
async function scrapeEbayAUSold(card) {
  const keywords = buildKeywords(card);
  // Search eBay AU completed/sold listings, sorted by most recent, exclude graded
  const query    = `${keywords} -PSA -BGS -CGC -ACE -HGA -graded -slab`;
  const url      = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_sop=13&LH_PrefLoc=1`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-AU,en;q=0.9',
    },
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) throw new Error(`eBay returned ${res.status}`);
  const html = await res.text();

  // Extract sold prices from eBay search results HTML
  const prices = extractPrices(html);

  if (prices.length === 0) return null;

  // Filter outliers — remove top/bottom 10%
  const sorted  = [...prices].sort((a, b) => a - b);
  const trimmed = sorted.slice(
    Math.floor(sorted.length * 0.1),
    Math.ceil(sorted.length * 0.9)
  );

  if (trimmed.length === 0) return null;

  const median = trimmed[Math.floor(trimmed.length / 2)];
  const low    = trimmed[0];
  const high   = trimmed[trimmed.length - 1];

  return {
    price:      Math.round(median * 100) / 100,
    low:        Math.round(low * 100) / 100,
    mid:        Math.round(median * 100) / 100,
    high:       Math.round(high * 100) / 100,
    count:      prices.length,
    confidence: prices.length >= 5 ? 'high' : prices.length >= 2 ? 'medium' : 'low',
    notes:      `${prices.length} recent eBay AU sold listing${prices.length !== 1 ? 's' : ''}, median $${median.toFixed(2)} AUD`,
    source:     'ebay-au'
  };
}

function extractPrices(html) {
  const prices = [];

  // eBay price patterns in search results HTML
  // Prices appear in spans with class s-item__price or similar, in format AU $12.50
  const patterns = [
    /AU \$(\d+(?:\.\d{2})?)/g,
    /"soldPrice"[^>]*>AU \$(\d+(?:\.\d{2})?)/g,
    /class="[^"]*s-item__price[^"]*"[^>]*>\s*AU \$(\d+(?:\.\d{2})?)/g,
    /"price":"(\d+(?:\.\d{2})?)"/g,
  ];

  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(html)) !== null) {
      const price = parseFloat(match[1]);
      // Sanity check — ignore prices outside reasonable range for TCG cards
      if (price >= 1 && price <= 2000) {
        prices.push(price);
      }
    }
  }

  // Deduplicate and return unique prices
  return [...new Set(prices)];
}

function buildKeywords(card) {
  if (card.game === 'onePiece') {
    const variant = card.variant?.label && card.variant.label !== 'Standard'
      ? ` ${card.variant.label}` : '';
    const lang    = card.lang === 'Japanese' ? ' Japanese' : '';
    return `${card.number}${variant} One Piece${lang}`;
  }
  return `${card.name} ${card.setName} Pokemon`.trim();
}

/* ─── Claude fallback prompt ─────────────────────────────────── */
function buildClaudePrompt(card) {
  if (card.game === 'onePiece') {
    const variant = card.variant?.label && card.variant.label !== 'Standard'
      ? ` (${card.variant.label})` : '';
    return `You are a One Piece TCG pricing expert for the Australian eBay market in 2025.

Give a conservative current eBay AU selling price in AUD for:
- Card: ${card.name || card.number}
- Number: ${card.number}${variant}
- Language: ${card.lang}
- Condition: ${card.cond}

2025 AU market reality:
- Most SRs: $3–$8 AUD
- Popular character SRs (Luffy, Zoro, Shanks): $8–$20 AUD
- SE cards: $10–$40 AUD
- SEC cards: $20–$80 AUD
- Default for unknown SR: $5.00 AUD
- Price conservatively

Respond ONLY with valid JSON:
{"low": 0.00, "mid": 0.00, "high": 0.00, "confidence": "low", "notes": "one sentence"}`;
  }

  return `You are a Pokémon TCG pricing expert for the Australian eBay market in 2025.

Give a conservative current eBay AU selling price in AUD for:
- Card: ${card.name}
- Set: ${card.setName}
- Condition: ${card.cond}

Price conservatively. Default $5.00 if uncertain.

Respond ONLY with valid JSON:
{"low": 0.00, "mid": 0.00, "high": 0.00, "confidence": "low", "notes": "one sentence"}`;
}

function parseJSON(text) {
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch(e) {
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse response');
  }
}
