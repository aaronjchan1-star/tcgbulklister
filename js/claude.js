/**
 * claude.js
 * Handles pricing via /api/claude — scrapes eBay AU sold listings,
 * falls back to Claude AI. Supports bulk (all unpriced) or single card.
 */

const ClaudeAI = (() => {

  async function fetchPrice(card) {
    const resp = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${resp.status}`);
    }
    return await resp.json();
  }

  // Price a single card by index — called when user clicks the price field's fetch btn
  async function priceOne(index) {
    const items = Listings.getItems();
    const card  = items[index];
    if (!card) return;

    const statusEl = document.getElementById('save-status');
    if (statusEl) { statusEl.textContent = `Researching ${card.name || card.number}...`; statusEl.style.opacity = '1'; }

    try {
      const result = await fetchPrice(card);
      const price  = result.price || result.mid;
      if (price && price >= 0.50) {
        Listings.updatePrice(index, price, result);
      }
    } catch(e) {
      console.warn('priceOne failed:', e.message);
    }

    if (statusEl) {
      setTimeout(() => { statusEl.style.opacity = '0'; }, 2000);
    }
  }

  async function bulkPrice() {
    const items    = Listings.getItems();
    const unpriced = items
      .map((c, i) => ({ card: c, index: i }))
      .filter(({ card }) => !card.price || card.price === 0);

    if (unpriced.length === 0) {
      const s = document.getElementById('save-status');
      if (s) { s.textContent = 'All cards already have prices.'; s.style.opacity='1'; setTimeout(()=>s.style.opacity='0',3000); }
      return;
    }

    const btn      = document.getElementById('claude-bulk-btn');
    const statusEl = document.getElementById('claude-bulk-status');
    const progress = document.getElementById('claude-progress-fill');

    btn.disabled           = true;
    statusEl.style.display = 'block';
    document.getElementById('claude-progress-wrap').style.display = 'block';

    let success = 0, failed = 0, lowConf = 0;

    for (let i = 0; i < unpriced.length; i++) {
      const { card, index } = unpriced[i];
      const pct = Math.round((i / unpriced.length) * 100);

      statusEl.textContent = `Researching ${i + 1}/${unpriced.length}: ${card.name || card.number} (${card.listingType || 'set'})...`;
      if (progress) progress.style.width = `${pct}%`;

      try {
        const result = await fetchPrice(card);
        const price  = result.price || result.mid;
        if (price && price >= 0.50) {
          Listings.updatePrice(index, price, result);
          success++;
          if (result.confidence === 'low') lowConf++;
          // Show what Claude found for this card
          const salesNote = result.sales_found !== undefined ? ` (${result.sales_found} sales found)` : '';
          statusEl.textContent = `✓ ${card.name || card.number} → $${price.toFixed(2)} AUD${salesNote}`;
        } else {
          failed++;
          statusEl.textContent = `✗ ${card.name || card.number} — no price data found`;
        }
      } catch(e) {
        console.warn(`Failed ${card.number}:`, e.message);
        statusEl.textContent = `✗ ${card.name || card.number} — ${e.message}`;
        failed++;
      }

      if (i < unpriced.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    if (progress) progress.style.width = '100%';

    const ebayCount  = Listings.getItems().filter(c => c.priceSource === 'ebay-au').length;
    const claudeCount = Listings.getItems().filter(c => c.priceSource === 'claude').length;
    const srcNote    = `<span style="color:var(--green);">${ebayCount} from eBay AU${claudeCount > 0 ? `, ${claudeCount} from Claude AI` : ''}</span>`;
    statusEl.innerHTML = `Done — <strong>${success}</strong> priced, <strong>${failed}</strong> failed. ${srcNote}${lowConf > 0 ? ` <span style="color:var(--amber);">${lowConf} low confidence</span>` : ''}`;
    btn.disabled = false;
    Listings.render();

    setTimeout(() => {
      statusEl.style.display = 'none';
      document.getElementById('claude-progress-wrap').style.display = 'none';
      if (progress) progress.style.width = '0%';
    }, 12000);
  }

  return { bulkPrice, priceOne };
})();
