/**
 * api.js
 * Price lookup — opens eBay AU sold listings search in a new tab.
 * The eBay Finding API is blocked by CORS proxies due to eBay's datacenter IP restrictions,
 * so we use direct eBay search links instead.
 */

const API = (() => {
  const STORAGE_KEY = 'ebay_app_id';

  // Base URL for eBay AU completed/sold listings search
  const EBAY_SOLD_BASE = 'https://www.ebay.com.au/sch/i.html?LH_Sold=1&LH_Complete=1&_sacat=0&_nkw=';

  let appId = localStorage.getItem(STORAGE_KEY) || '';

  function save() {
    const val      = document.getElementById('api-key-input').value.trim();
    const statusEl = document.getElementById('api-status');
    if (!val) {
      statusEl.textContent = 'Please paste your Client ID first.';
      statusEl.className   = 'api-status err';
      return;
    }
    appId = val;
    localStorage.setItem(STORAGE_KEY, val);
    statusEl.textContent = 'Key saved.';
    statusEl.className   = 'api-status ok';
  }

  /* ─── Open eBay sold search for a single card ─── */
  function lookup() {
    const game = Listings.getGame();
    let query, statusEl;

    if (game === 'onePiece') {
      const number = document.getElementById('f-op-number').value.trim().toUpperCase();
      const lang   = document.getElementById('f-op-lang').value;
      const name   = document.getElementById('f-op-name').value.trim();
      statusEl = document.getElementById('lookup-status');

      if (!number) {
        statusEl.textContent = 'Enter a card number first.';
        statusEl.className   = 'lookup-status err';
        return;
      }

      query = `${number} One Piece${name ? ' ' + name : ''}${lang === 'Japanese' ? ' Japanese' : ''}`;

    } else {
      const selected = UI.getSelectedPokemonCard();
      const name     = document.getElementById('f-pk-name').value.trim();
      const number   = document.getElementById('f-pk-number').value.trim();
      statusEl = document.getElementById('pk-lookup-status');

      if (!name && !number) {
        statusEl.textContent = 'Search for a card first.';
        statusEl.className   = 'lookup-status err';
        return;
      }

      const setName = selected?.set?.name || '';
      query = `${name} ${setName} Pokemon card`.trim();
    }

    const url = EBAY_SOLD_BASE + encodeURIComponent(query);
    window.open(url, '_blank');

    statusEl.textContent = 'eBay sold listings opened in a new tab — enter the price manually.';
    statusEl.className   = 'lookup-status ok';
  }

  /* ─── Bulk: open eBay search for all unpriced cards ─── */
  function bulkFetch() {
    const items    = Listings.getItems();
    const unpriced = items.filter(c => !c.price || c.price === 0);

    if (unpriced.length === 0) {
      alert('All cards already have prices.');
      return;
    }

    if (unpriced.length > 5) {
      if (!confirm(`This will open ${unpriced.length} eBay search tabs. Your browser may block some. Continue?`)) return;
    }

    unpriced.forEach((card, i) => {
      setTimeout(() => {
        let query;
        if (card.game === 'onePiece') {
          query = `${card.number} One Piece${card.name ? ' ' + card.name : ''}${card.lang === 'Japanese' ? ' Japanese' : ''}`;
        } else {
          query = `${card.name} ${card.setName} Pokemon card`.trim();
        }
        window.open(EBAY_SOLD_BASE + encodeURIComponent(query), '_blank');
      }, i * 300); // stagger to avoid popup blocker
    });

    const statusEl = document.getElementById('bulk-status');
    statusEl.style.display = 'block';
    statusEl.textContent   = `Opened ${unpriced.length} eBay search tab${unpriced.length !== 1 ? 's' : ''} — enter prices manually then close tabs.`;
    setTimeout(() => { statusEl.style.display = 'none'; }, 8000);
  }

  // Restore key on load
  window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      document.getElementById('api-key-input').value = saved;
    }
  });

  return { save, lookup, bulkFetch };
})();
