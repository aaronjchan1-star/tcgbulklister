/**
 * claude.js
 * Calls /api/claude Vercel function which proxies Anthropic API server-side.
 */

const ClaudeAI = (() => {

  async function fetchPrice(card) {
    const response = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${response.status}`);
    }

    return await response.json();
  }

  async function bulkPrice() {
    const items    = Listings.getItems();
    const unpriced = items
      .map((c, i) => ({ card: c, index: i }))
      .filter(({ card }) => !card.price || card.price === 0);

    if (unpriced.length === 0) { alert('All cards already have prices.'); return; }

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

      statusEl.textContent = `Researching ${i + 1} of ${unpriced.length}: ${card.name || card.number}...`;
      if (progress) progress.style.width = `${pct}%`;

      try {
        const result = await fetchPrice(card);
        // Enforce minimum $2.00 — anything lower means Claude has no data
        const mid = result.mid && result.mid >= 2 ? result.mid : null;
        if (mid) {
          Listings.updatePrice(index, mid, result);
          success++;
          if (result.confidence === 'low') lowConf++;
        } else {
          failed++;
        }
      } catch(e) {
        console.warn(`Failed for ${card.number || card.name}:`, e.message);
        failed++;
      }

      if (i < unpriced.length - 1) await new Promise(r => setTimeout(r, 350));
    }

    if (progress) progress.style.width = '100%';
    const ebayCount  = Listings.getItems().filter(c => c.priceSource === 'ebay-au').length;
    const claudeCount = Listings.getItems().filter(c => c.priceSource === 'claude').length;
    const srcNote = ebayCount > 0
      ? ` <span style="color:var(--green);">${ebayCount} from eBay AU sold listings${claudeCount > 0 ? `, ${claudeCount} from Claude AI estimate` : ''}</span>`
      : '';
    statusEl.innerHTML = `Done — <strong>${success}</strong> priced, <strong>${failed}</strong> failed.${srcNote}${lowConf > 0 ? ` <span style="color:var(--amber);">${lowConf} low-confidence — verify on eBay.</span>` : ''}`;
    btn.disabled = false;
    Listings.render();

    setTimeout(() => {
      statusEl.style.display = 'none';
      document.getElementById('claude-progress-wrap').style.display = 'none';
      if (progress) progress.style.width = '0%';
    }, 10000);
  }

  return { bulkPrice };
})();
