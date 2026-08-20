/**
 * api.js
 * eBay sold price lookup — opens direct eBay AU sold search (graded excluded).
 * Note: eBay's findCompletedItems API was decommissioned Feb 2025.
 * Automatic price fetching is no longer possible without eBay Business API access.
 */

const API = (() => {
  const STORAGE_KEY = 'ebay_app_id';
  const EBAY_SOLD   = 'https://www.ebay.com.au/sch/i.html?LH_Sold=1&LH_Complete=1&_sop=13&_sacat=0&_nkw=';

  let appId = localStorage.getItem(STORAGE_KEY) || '';

  function save() {
    const val = document.getElementById('api-key-input').value.trim();
    appId = val;
    if (val) localStorage.setItem(STORAGE_KEY, val);
  }

  function buildEbayUrl(keywords, categoryId) {
    const clean = `${keywords} -PSA -BGS -CGC -ACE -HGA -graded -slab`;
    return `https://www.ebay.com.au/sch/i.html?LH_Sold=1&LH_Complete=1&_sop=13&_sacat=${categoryId || 0}&_nkw=${encodeURIComponent(clean)}`;
  }

  function buildKeywords(card) {
    const variant = typeof card.variant === 'string' ? card.variant : (card.variant?.label || '');
    if (card.game === 'pokemon') {
      const finish = (variant && !['Normal','Holo',''].includes(variant)) ? variant : '';
      return [card.name, card.printedNumber || card.number, card.setName || '', finish, 'Pokemon'].filter(Boolean).join(' ');
    }
    if (card.game === 'riftbound') return `${card.number} ${card.name} Riftbound`;
    if (card.game === 'yugioh')    return `${card.number} ${card.name} Yugioh`.trim();
    if (card.game === 'gundam')    return `${card.number} ${card.name} Gundam Card Game`.trim();
    // One Piece (default for OP-style numbers)
    const alt = /parallel|full art|alt/i.test(variant) ? 'Parallel' : '';
    return [card.number, card.name, alt, 'One Piece'].filter(Boolean).join(' ');
  }

  function buildSearchKeywords(game) {
    if (game === 'onePiece') {
      const number = document.getElementById('f-op-number').value.trim().toUpperCase();
      return `${number} One Piece`;
    }
    const name     = document.getElementById('f-pk-name').value.trim();
    const selected = UI.getSelectedPokemonCard();
    const setName  = selected?.set?.name || '';
    return `${name} ${setName} Pokemon`.trim();
  }

  /* ─── Single lookup — opens eBay tab ─── */
  function lookup() {
    const game = Listings.getGame();
    const keywords   = buildSearchKeywords(game);
    const categoryId = game === 'pokemon' ? '2536' : '183454';
    const statusEl   = game === 'onePiece'
      ? document.getElementById('lookup-status')
      : document.getElementById('pk-lookup-status');

    if (!keywords.trim()) {
      statusEl.textContent = 'Enter a card number first.';
      statusEl.className   = 'lookup-status err';
      return;
    }

    const url = buildEbayUrl(keywords, categoryId);
    window.open(url, '_blank');
    statusEl.innerHTML = `eBay AU sold listings opened — enter the price manually. <a href="${url}" target="_blank" style="color:var(--accent);">Reopen ↗</a>`;
    statusEl.className = 'lookup-status ok';
  }

  /* ─── Bulk — open eBay tabs for all unpriced ─── */
  function bulkFetch() {
    const items    = Listings.getItems();
    const unpriced = items.filter(c => !c.price || c.price === 0);

    if (unpriced.length === 0) {
      const s = document.getElementById('save-status');
      if (s) { s.textContent = 'All cards already have prices.'; s.style.opacity='1'; setTimeout(()=>s.style.opacity='0',3000); }
      return;
    }

    if (unpriced.length > 5 && !confirm(`Open ${unpriced.length} eBay tabs?`)) return;

    unpriced.forEach((card, i) => {
      const categoryId = card.game === 'pokemon' ? '2536' : '183454';
      setTimeout(() => {
        window.open(buildEbayUrl(buildKeywords(card), categoryId), '_blank');
      }, i * 400);
    });

    const statusEl = document.getElementById('bulk-status');
    statusEl.style.display = 'block';
    statusEl.textContent   = `Opened ${unpriced.length} eBay sold search tab${unpriced.length !== 1 ? 's' : ''} — enter prices, then close tabs.`;
    setTimeout(() => { statusEl.style.display = 'none'; }, 8000);
  }

  // Expose eBay URL builder for use in listings table
  function getEbayUrl(card) {
    const categoryId = card.game === 'pokemon' ? '2536' : '183454';
    return buildEbayUrl(buildKeywords(card), categoryId);
  }

  window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const input = document.getElementById('api-key-input');
      if (input) input.value = saved;
    }
  });

  return { save, lookup, bulkFetch, getEbayUrl };
})();
