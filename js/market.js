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
    const kw  = encodeURIComponent(buildKeywords(card));
    const cat = CATEGORY[card.game] || '';
    const resp = await fetch(`/api/ebaymarket?keywords=${kw}&categoryId=${cat}`);
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e.error || `Market check failed ${resp.status}`);
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

  async function bulkCheck() {
    const btn      = document.getElementById('market-check-btn');
    const statusEl = document.getElementById('market-status');
    const items    = Listings.getItems();

    const priced = items.map((c, i) => ({ card: c, index: i })).filter(({ card }) => card.price > 0);
    if (!priced.length) {
      if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Set some prices first, then check them against the market.'; }
      return;
    }

    if (btn) btn.disabled = true;
    if (statusEl) statusEl.style.display = 'block';

    let checked = 0, notConfigured = false, inRange = 0, off = 0;

    for (let i = 0; i < priced.length; i++) {
      const { card, index } = priced[i];
      if (statusEl) statusEl.textContent = `Checking ${i + 1}/${priced.length}: ${card.name || card.number}...`;
      try {
        const m = await fetchMarket(card);
        if (m.configured === false) { notConfigured = true; break; }
        if (m.found > 0) {
          const v = verdict(card.price, m.soldEstimate);
          Listings.setMarketCheck(index, {
            activeMedian: m.activeMedian,
            soldEstimate: m.soldEstimate,
            found:        m.found,
            verdict:      v
          });
          checked++;
          if (v?.label === 'ok') inRange++; else off++;
        } else {
          Listings.setMarketCheck(index, { found: 0 });
        }
      } catch(e) {
        if (statusEl) statusEl.textContent = `✗ ${card.name || card.number} — ${e.message}`;
      }
      await new Promise(r => setTimeout(r, 250));
    }

    if (btn) btn.disabled = false;

    if (notConfigured) {
      if (statusEl) statusEl.innerHTML = '⚠️ eBay market check not set up. Add <code>EBAY_APP_ID</code> &amp; <code>EBAY_CERT_ID</code> env vars on Vercel (see EBAY_MARKET_SETUP.md).';
      return;
    }
    if (statusEl) statusEl.innerHTML = `Checked <strong>${checked}</strong> card${checked !== 1 ? 's' : ''} — <span style="color:var(--green)">${inRange} in range</span>, <span style="color:var(--amber)">${off} off market</span>. See indicators next to each price.`;
  }

  return { bulkCheck, verdict };
})();
