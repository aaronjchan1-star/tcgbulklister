/**
 * claude.js
 * Uses Anthropic API to research and suggest prices for TCG cards.
 * Calls Claude with card details and gets back a suggested AUD price.
 */

const ClaudeAI = (() => {

  const API_URL = 'https://api.anthropic.com/v1/messages';
  const MODEL   = 'claude-sonnet-4-20250514';

  async function fetchPrice(card) {
    const prompt = buildPrompt(card);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);
    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return parseResponse(text);
  }

  function buildPrompt(card) {
    if (card.game === 'onePiece') {
      const variant = card.variant?.label && card.variant.label !== 'Standard'
        ? ` (${card.variant.label})` : '';
      return `You are a One Piece TCG pricing expert for the Australian market.

I need a price estimate in AUD for this card to list on eBay Australia:

Card: ${card.name || card.number}
Card Number: ${card.number}${variant}
Language: ${card.lang}
Condition: ${card.cond}

Based on your knowledge of recent eBay AU sold listings for One Piece TCG cards (excluding PSA/BGS/CGC graded cards), what is a realistic selling price range in AUD for this card in ${card.cond} condition?

Consider:
- Raw (ungraded) copies only
- Australian market pricing (typically 10-20% higher than US)
- Current demand and print run for this set

Respond in this exact JSON format only, no other text:
{"low": 5.00, "mid": 8.00, "high": 12.00, "confidence": "medium", "notes": "Brief reason"}

Confidence levels: high (well-known card, stable price), medium (some market data), low (limited data, estimate only)`;
    }

    return `You are a Pokémon TCG pricing expert for the Australian market.

I need a price estimate in AUD for this card to list on eBay Australia:

Card: ${card.name}
Set: ${card.setName}
Card Number: ${card.number}
Condition: ${card.cond}

Based on your knowledge of recent eBay AU sold listings for Pokémon TCG cards (excluding PSA/BGS/CGC graded cards), what is a realistic selling price range in AUD for this card in ${card.cond} condition?

Consider:
- Raw (ungraded) copies only
- Australian market pricing
- Current demand for this card

Respond in this exact JSON format only, no other text:
{"low": 5.00, "mid": 8.00, "high": 12.00, "confidence": "medium", "notes": "Brief reason"}

Confidence levels: high (well-known card, stable price), medium (some market data), low (limited data, estimate only)`;
  }

  function parseResponse(text) {
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch(e) {
      // Try to extract JSON from text
      const match = text.match(/\{[^}]+\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Could not parse price response');
    }
  }

  /* ─── Single card price lookup ─── */
  async function lookupPrice(card) {
    return await fetchPrice(card);
  }

  /* ─── Bulk price all unpriced cards ─── */
  async function bulkPrice() {
    const items    = Listings.getItems();
    const unpriced = items
      .map((c, i) => ({ card: c, index: i }))
      .filter(({ card }) => !card.price || card.price === 0);

    if (unpriced.length === 0) {
      alert('All cards already have prices.');
      return;
    }

    const btn      = document.getElementById('claude-bulk-btn');
    const statusEl = document.getElementById('claude-bulk-status');
    const progress = document.getElementById('claude-progress');

    btn.disabled           = true;
    statusEl.style.display = 'block';
    progress.style.display = 'block';

    let success = 0, failed = 0, lowConf = 0;

    for (let i = 0; i < unpriced.length; i++) {
      const { card, index } = unpriced[i];
      const pct = Math.round(((i) / unpriced.length) * 100);

      statusEl.textContent = `Researching ${i + 1} of ${unpriced.length}: ${card.name || card.number}...`;
      progress.style.width = `${pct}%`;

      try {
        const result = await fetchPrice(card);

        // Use mid price, flag low confidence items
        if (result.mid) {
          Listings.updatePrice(index, result.mid, result);
          success++;
          if (result.confidence === 'low') lowConf++;
        } else {
          failed++;
        }
      } catch(e) {
        console.warn(`Failed for ${card.number}:`, e.message);
        failed++;
      }

      // Small delay to avoid rate limits
      if (i < unpriced.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    progress.style.width = '100%';
    statusEl.innerHTML = `
      Done — <strong>${success}</strong> priced, <strong>${failed}</strong> failed.
      ${lowConf > 0 ? `<span style="color:var(--amber);">${lowConf} low-confidence — verify these on eBay.</span>` : ''}
    `;
    btn.disabled = false;
    Listings.render();

    setTimeout(() => {
      statusEl.style.display = 'none';
      progress.style.display = 'none';
      progress.style.width   = '0%';
    }, 8000);
  }

  return { lookupPrice, bulkPrice };
})();
