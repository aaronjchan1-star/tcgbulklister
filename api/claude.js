/**
 * api/claude.js
 * Uses Claude with web_search to research eBay AU sold prices.
 * Claude can read actual listings, filter variants, and price accurately.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { card } = req.body;
  if (!card) return res.status(400).json({ error: 'Missing card data' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'API key not configured' });

  const name      = card.name && card.name !== card.number ? card.name : '';
  const number    = card.number.toUpperCase();
  const variant   = card.variant?.label && card.variant.label !== 'Standard' && card.variant.label !== '' 
    ? card.variant.label : null;
  const lang      = card.lang === 'Japanese' ? 'Japanese' : 'English';
  const isPlayset = card.listingType === 'playset';
  const isLot     = card.listingType === 'lot' && card.qty > 1;
  const qty       = card.qty || 1;

  // Build a precise listing description for Claude to search
  const cardDesc = [
    name || number,
    number,
    variant ? `(${variant})` : '',
    lang === 'Japanese' ? 'Japanese' : '',
  ].filter(Boolean).join(' ');

  const listingContext = isPlayset
    ? `a playset (4x copies bundled)`
    : isLot
      ? `a ${qty}x lot`
      : `a single card`;

  const prompt = `You are pricing One Piece TCG cards for eBay Australia. 

I need the current market price for ${listingContext}:
- Card: ${cardDesc}
- Condition: ${card.cond}

Please search eBay Australia for SOLD listings of this exact card. Use the search query: "${number} ${name} One Piece site:ebay.com.au"

IMPORTANT rules when analysing results:
1. Only count sales of the EXACT variant — ${variant ? `this is the ${variant} version` : 'standard/regular version (NOT alternate art, NOT gold, NOT manga rare, NOT SEC)'}
2. Only count ${lang} language copies
3. Exclude: graded cards (PSA/BGS/CGC), sealed product, lots/bundles (unless pricing a lot)
4. Only count Australian seller sales (prices in AUD)
5. Focus on the last 60 days — older sales are less relevant
6. If fewer than 3 matching sales found, note low confidence

After reviewing the actual sold listings, provide your best price estimate.

Respond ONLY with valid JSON:
{
  "price": 0.00,
  "low": 0.00,
  "mid": 0.00, 
  "high": 0.00,
  "confidence": "high|medium|low",
  "sales_found": 0,
  "notes": "brief summary of what you found"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search'
          }
        ],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API ${response.status}: ${err}`);
    }

    const data = await response.json();
    
    // Extract text from response (may include tool use blocks)
    const textContent = data.content
      ?.filter(b => b.type === 'text')
      ?.map(b => b.text)
      ?.join('') || '';

    if (!textContent) throw new Error('No text response from Claude');

    const result = parseJSON(textContent);
    result.source = 'claude-search';
    // Use mid as the recommended price if price not set
    if (!result.price && result.mid) result.price = result.mid;
    
    return res.status(200).json(result);

  } catch(err) {
    console.error('Claude pricing error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

function parseJSON(text) {
  try {
    // Find JSON block in response
    const match = text.match(/\{[\s\S]*"price"[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    throw new Error('Could not parse price response');
  }
}
