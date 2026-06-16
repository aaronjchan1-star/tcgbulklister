/**
 * js/market.js — eBay market price check
 * Compares each card's price against current eBay AU active listings.
 */
const Market = (() => {

  const CATEGORY = { onePiece: '183454', pokemon: '2536', riftbound: '183050', yugioh: '183454' };

  function buildKeywords(card) {
    const num = card.printedNumber || card.number;
    if (card.game === 'onePiece') return `${card.number} One Piece`;
    if (card.game === 'pokemon')  return `${cleanName(card.name)} ${card.setName || ''} Pokemon`.trim();
    if (card.game === 'riftbound') return `${card.number} Riftbound`;
    if (card.game === 'yugioh')   return `${card.number} Yugioh`;
    return card.number;
  }
  function cleanName(n) { return (n || '').replace(/\s*\(.*$/, '').trim(); }

  async function fetchMarket(card) {
    // Smart pricing: eBay returns listings, Claude filters to exact card+variant
    const resp = await fetch('/api/smartprice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card })
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e.error || `Pricing failed ${resp.status}`);
    }
    return resp.json();
  }

  function verdict(price, soldEstimate) {
    if (!soldEstimate) return null;
    const ratio = price / soldEstimate;
    if (ratio > 1.30) return { label: 'high',  color: 'var(--amber)', text: 'Above market' };
    if (ratio < 0.70) return { label: 'low',   color: '#60a5fa',      text: 'Below market' };
    return { label: 'ok', color: 'var(--green)', text: 'In range' };
  }

  // How many single cards a listing contains (playset = 4, lot = qty, single = 1)
  function unitsInListing(card) {
    if (card.listingType === 'playset') return 4;
    return card.qty || 1;
  }

  // Build the suggested listing price from a per-card sold estimate.
  // Multi-card lots/playsets multiply by units, with a small bundle discount
  // (buyers expect a slight saving when buying several at once).
  function suggestedPrice(perCardSold, units) {
    if (!perCardSold) return null;
    let price = perCardSold * units;
    if (units >= 4)      price *= 0.92;  // playset / 4x — ~8% bundle saving
    else if (units === 3) price *= 0.95;
    else if (units === 2) price *= 0.97;
    return Math.max(1.00, Math.round(price * 100) / 100);
  }

  async function bulkCheck(autofill) {
    const btn      = document.getElementById('market-check-btn');
    const statusEl = document.getElementById('market-status');
    const items    = Listings.getItems();

    // When autofilling, check ALL cards (even unpriced). Otherwise only priced ones.
    const targets = autofill
      ? items.map((c, i) => ({ card: c, index: i }))
      : items.map((c, i) => ({ card: c, index: i })).filter(({ card }) => card.price > 0);

    if (!targets.length) {
      if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = autofill ? 'Add some cards first.' : 'Set some prices first, then check them against the market.'; }
      return;
    }

    if (btn) btn.disabled = true;
    const fillBtn = document.getElementById('market-autofill-btn');
    if (fillBtn) fillBtn.disabled = true;
    if (statusEl) statusEl.style.display = 'block';

    let checked = 0, notConfigured = false, inRange = 0, off = 0, filled = 0, noComps = 0;

    for (let i = 0; i < targets.length; i++) {
      const { card, index } = targets[i];
      if (statusEl) statusEl.textContent = `Checking ${i + 1}/${targets.length}: ${card.name || card.number}...`;
      try {
        const m = await fetchMarket(card);
        if (m.configured === false) { notConfigured = true; break; }
        const perCard = m.perCardPrice;
        if (m.found > 0 && perCard) {
          const units      = unitsInListing(card);
          const suggested  = suggestedPrice(perCard, units);

          if (autofill && suggested) {
            Listings.updatePrice(index, suggested, {
              source:     'ebay+claude',
              confidence: m.confidence || (m.matches >= 4 ? 'high' : m.matches >= 2 ? 'medium' : 'low'),
              notes:      `${m.matches} eBay match${m.matches !== 1 ? 'es' : ''}: $${perCard}/card${units > 1 ? ` × ${units}` : ''}. ${m.notes || ''}`
            });
            filled++;
          }

          const compareTo   = autofill ? suggested : card.price;
          const expectTotal = perCard * units;
          const v = verdict(compareTo, expectTotal);

          Listings.setMarketCheck(index, {
            soldEstimate: perCard,        // per single card (Claude-filtered)
            perListing:   suggested,      // qty-adjusted listing price
            matches:      m.matches,
            confidence:   m.confidence,
            units,
            found:        m.found,
            verdict:      v
          });
          checked++;
          if (v?.label === 'ok') inRange++; else off++;
        } else {
          noComps++;
          Listings.setMarketCheck(index, { found: 0 });
        }
      } catch(e) {
        if (statusEl) statusEl.textContent = `✗ ${card.name || card.number} — ${e.message}`;
      }
      await new Promise(r => setTimeout(r, 250));
    }

    if (btn) btn.disabled = false;
    if (fillBtn) fillBtn.disabled = false;

    if (notConfigured) {
      if (statusEl) statusEl.innerHTML = '⚠️ eBay market check not set up. Add <code>EBAY_APP_ID</code> &amp; <code>EBAY_CERT_ID</code> env vars on Vercel (see EBAY_MARKET_SETUP.md).';
      return;
    }

    if (autofill) {
      if (statusEl) statusEl.innerHTML = `Auto-filled <strong>${filled}</strong> price${filled !== 1 ? 's' : ''} from eBay AU market${noComps ? `, <span style="color:var(--text-muted)">${noComps} had no comps</span>` : ''}. Lots &amp; playsets were multiplied by quantity.`;
    } else {
      if (statusEl) statusEl.innerHTML = `Checked <strong>${checked}</strong> card${checked !== 1 ? 's' : ''} — <span style="color:var(--green)">${inRange} in range</span>, <span style="color:var(--amber)">${off} off market</span>. See indicators next to each price.`;
    }
  }

  return { bulkCheck, verdict, suggestedPrice, unitsInListing };
})();
