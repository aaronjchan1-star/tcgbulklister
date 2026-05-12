/**
 * api/claude.js
 * Prices cards by having Claude search eBay AU sold listings.
 * Handles multi-turn conversation required when Claude uses web_search tool.
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
  const isLot     = card.listingType === 'lot' && (card.qty || 1) > 1;
  const qty       = card.qty || 1;

  const listingContext = isPlayset
    ? `a playset (4x copies bundled together)`
    : isLot ? `a ${qty}x lot` : `a single card`;

  const variantNote = variant
    ? `This is the ${variant} version specifically.`
    : `This is the standard/regular version (NOT alternate art, NOT gold, NOT manga rare, NOT SEC variant).`;

  const searchQuery = `${number} ${name} One Piece TCG ${lang === 'Japanese' ? 'Japanese ' : ''}sold eBay Australia`;

  const prompt = `You are pricing One Piece TCG cards for eBay Australia.

Search eBay Australia for recently SOLD listings of this card:
- Card number: ${number}
- Card name: ${name || 'unknown'}
- ${variantNote}
- Language: ${lang}
- Condition: ${card.cond}
- I need the price for: ${listingContext}

Search for: "${searchQuery}"

After searching, analyse the results carefully:
1. Only use sales of the EXACT same variant (${variant || 'standard'})
2. Only ${lang} language copies
3. Exclude graded cards (PSA/BGS/CGC/ACE), sealed product, and mixed lots unless pricing a lot
4. Only AUD prices from Australian sellers
5. Focus on sales from the last 90 days

Respond ONLY with this JSON (no other text before or after):
{"price":0.00,"low":0.00,"mid":0.00,"high":0.00,"confidence":"high|medium|low","sales_found":0,"notes":"what you found"}`;

  try {
    // Step 1: Send initial request with web_search tool
    const messages = [{ role: 'user', content: prompt }];
    
    let finalText = '';
    let iterations = 0;
    const MAX_ITER = 5;

    while (iterations < MAX_ITER) {
      iterations++;
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250514',
          max_tokens: 1024,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      const stopReason = data.stop_reason;

      // Collect any text from this response
      const textBlocks = (data.content || []).filter(b => b.type === 'text');
      if (textBlocks.length) {
        finalText += textBlocks.map(b => b.text).join('');
      }

      // If Claude finished, we're done
      if (stopReason === 'end_turn') break;

      // If Claude used a tool, add assistant response and continue
      if (stopReason === 'tool_use') {
        messages.push({ role: 'assistant', content: data.content });
        
        // Add tool results for each tool use block
        const toolUseBlocks = data.content.filter(b => b.type === 'tool_use');
        const toolResults = toolUseBlocks.map(tu => ({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: tu.input?.query ? `Searching for: ${tu.input.query}` : 'Search executed'
        }));
        
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      break;
    }

    if (!finalText) throw new Error('No response text from Claude');

    const result = parseJSON(finalText);
    result.source = 'claude-search';
    if (!result.price && result.mid) result.price = result.mid;

    return res.status(200).json(result);

  } catch(err) {
    console.error('Pricing error:', err.message);
    // Return a structured error so the client knows what happened
    return res.status(500).json({ error: err.message });
  }
}

function parseJSON(text) {
  // Try to find JSON in the response
  const match = text.match(/\{[^{}]*"price"[^{}]*\}/s);
  if (match) {
    try { return JSON.parse(match[0]); } catch(e) {}
  }
  // Try cleaning the whole text
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    throw new Error('Could not parse price from: ' + text.slice(0, 100));
  }
}
