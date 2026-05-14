/**
 * js/claude.js — Claude AI bulk pricing (client side)
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
    return resp.json();
  }

  async function bulkPrice() {
    const saveStatus = document.getElementById('save-status');
    const btn        = document.getElementById('claude-bulk-btn');
    const statusEl   = document.getElementById('claude-bulk-status');
    const progress   = document.getElementById('claude-progress-fill');
    const progWrap   = document.getElementById('claude-progress-wrap');

    // Immediate feedback
    if (saveStatus) { saveStatus.textContent = 'Starting price research...'; saveStatus.style.opacity = '1'; }

    const items = Listings.getItems();
    if (!items || !items.length) {
      if (saveStatus) { saveStatus.textContent = 'No cards in list.'; setTimeout(() => saveStatus.style.opacity = '0', 3000); }
      return;
    }

    const unpriced = items
      .map((c, i) => ({ card: c, index: i }))
      .filter(({ card }) => !card.price || card.price === 0);

    if (unpriced.length === 0) {
      if (saveStatus) { saveStatus.textContent = 'All cards already have prices.'; setTimeout(() => saveStatus.style.opacity = '0', 3000); }
      return;
    }

    if (btn) btn.disabled = true;
    if (statusEl) statusEl.style.display = 'block';
    if (progWrap) progWrap.style.display = 'block';
    if (saveStatus) saveStatus.style.opacity = '0';

    let success = 0, failed = 0, lowConf = 0;

    for (let i = 0; i < unpriced.length; i++) {
      const { card, index } = unpriced[i];
      if (progress) progress.style.width = `${Math.round(i / unpriced.length * 100)}%`;
      if (statusEl) statusEl.textContent = `Researching ${i + 1}/${unpriced.length}: ${card.name || card.number}...`;

      try {
        const result = await fetchPrice(card);
        const price  = result.price || result.mid;
        if (price && price >= 0.50) {
          Listings.updatePrice(index, price, result);
          success++;
          if (result.confidence === 'low') lowConf++;
          if (statusEl) statusEl.textContent = `✓ ${card.name || card.number} → $${price.toFixed(2)} AUD`;
        } else {
          failed++;
          if (statusEl) statusEl.textContent = `✗ ${card.name || card.number} — no data`;
        }
      } catch(e) {
        failed++;
        if (statusEl) statusEl.textContent = `✗ ${card.name || card.number} — ${e.message}`;
      }

      if (i < unpriced.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    if (progress) progress.style.width = '100%';
    if (statusEl) statusEl.innerHTML = `Done — <strong>${success}</strong> priced, <strong>${failed}</strong> failed.${lowConf > 0 ? ` <span style="color:var(--amber)">${lowConf} low confidence — verify on eBay</span>` : ''}`;
    if (btn) btn.disabled = false;
    Listings.render();
  }

  return { bulkPrice };
})();
