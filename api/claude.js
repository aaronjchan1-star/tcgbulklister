/**
 * api/claude.js
 * Vercel serverless function — calls Anthropic API server-side to avoid CORS.
 * POST body: { card: { game, number, name, lang, cond, setName, variant } }
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { card } = req.body;
  if (!card) return res.status(400).json({ error: 'Missing card data' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

  const prompt = buildPrompt(card);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${err}`);
    }

    const data   = await response.json();
    const text   = data.content?.[0]?.text || '';
    const result = parseResponse(text);
    return res.status(200).json(result);

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}

function buildPrompt(card) {
  if (card.game === 'onePiece') {
    const variant = card.variant?.label && card.variant.label !== 'Standard'
      ? ` (${card.variant.label})` : '';
    return `You are a One Piece TCG pricing expert for the Australian eBay market. Give a price estimate in AUD for:

Card: ${card.name || card.number}
Number: ${card.number}${variant}
Language: ${card.lang}
Condition: ${card.cond}

Raw/ungraded copies only. Australian market (typically 10-20% above US prices).

Respond ONLY with this JSON, nothing else:
{"low": 0.00, "mid": 0.00, "high": 0.00, "confidence": "high|medium|low", "notes": "one sentence reason"}`;
  }

  return `You are a Pokémon TCG pricing expert for the Australian eBay market. Give a price estimate in AUD for:

Card: ${card.name}
Set: ${card.setName}
Number: ${card.number}
Condition: ${card.cond}

Raw/ungraded copies only. Australian market pricing.

Respond ONLY with this JSON, nothing else:
{"low": 0.00, "mid": 0.00, "high": 0.00, "confidence": "high|medium|low", "notes": "one sentence reason"}`;
}

function parseResponse(text) {
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch(e) {
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse response: ' + text);
  }
}
