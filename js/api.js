/**
 * api.js
 * eBay Finding API — single and bulk last sold price lookup.
 */

const API = (() => {
  const STORAGE_KEY      = 'ebay_app_id';
  const PROXY            = 'https://api.allorigins.win/get?url=';
  const FINDING_ENDPOINT = 'https://svcs.ebay.com/services/search/FindingService/v1';

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
    statusEl.textContent = 'Key saved. Ready to fetch prices.';
    statusEl.className   = 'api-status ok';
  }

  async function fetchPrice(keywords, categoryId) {
    if (!appId) throw new Error('No API key saved.');

    const findingUrl = [
      FINDING_ENDPOINT,
      '?OPERATION-NAME=findCompletedItems',
      '&SERVICE-VERSION=1.0.0',
      `&SECURITY-APPNAME=${encodeURIComponent(appId)}`,
      '&RESPONSE-DATA-FORMAT=JSON',
      `&keywords=${encodeURIComponent(keywords)}`,
      `&categoryId=${categoryId}`,
      '&itemFilter(0).name=SoldItemsOnly',
      '&itemFilter(0).value=true',
      '&itemFilter(1).name=Currency',
      '&itemFilter(1).value=AUD',
      '&itemFilter(2).name=ListingType',
      '&itemFilter(2).value=FixedPrice',
      '&sortOrder=EndTimeSoonest',
      '&paginationInput.entriesPerPage=5'
    ].join('');

    const res = await fetch(PROXY + encodeURIComponent(findingUrl));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const outer = await res.json();
    const data  = JSON.parse(outer.contents);
    const root  = data?.findCompletedItemsResponse?.[0];
    const ack   = root?.ack?.[0];

    if (ack !== 'Success') {
      const errMsg = root?.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'eBay error';
      throw new Error(errMsg);
    }

    const soldItems = root?.searchResult?.[0]?.item;
    if (!soldItems || soldItems.length === 0) return null;

    const prices = soldItems
      .map(i => parseFloat(i?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__))
      .filter(p => !isNaN(p) && p > 0)
      .sort((a, b) => a - b);

    return prices.length > 0 ? prices[Math.floor(prices.length / 2)] : null;
  }

  function buildKeywords(card) {
    if (card.game === 'onePiece') {
      return `${card.number} One Piece TCG SR ${card.lang}`;
    }
    return `${card.name} ${card.setName} ${card.number} Pokémon TCG`.trim();
  }

  /* ─── Single lookup (from form) ─── */
  async function lookup() {
    const game = Listings.getGame();
    let keywords, statusEl, labelEl, btn, categoryId;

    if (game === 'onePiece') {
      const cardNumber = document.getElementById('f-op-number').value.trim().toUpperCase();
      const lang       = document.getElementById('f-op-lang').value;
      if (!cardNumber) {
        setStatus('lookup-status', 'Enter a card number first.', 'err');
        return;
      }
      keywords   = `${cardNumber} One Piece TCG SR ${lang}`;
      categoryId = '183454';
      statusEl   = document.getElementById('lookup-status');
      labelEl    = document.getElementById('lookup-label');
      btn        = document.getElementById('btn-lookup');
    } else {
      const setName = document.getElementById('f-pk-set').selectedOptions[0]?.text || '';
      const number  = document.getElementById('f-pk-number').value.trim();
      const name    = document.getElementById('f-pk-name').value.trim();
      if (!number) {
        setStatus('pk-lookup-status', 'Enter a card number first.', 'err');
        return;
      }
      keywords   = `${name} ${setName} ${number} Pokémon TCG`.trim();
      categoryId = '2536';
      statusEl   = document.getElementById('pk-lookup-status');
      labelEl    = null;
      btn        = null;
    }

    if (!appId) {
      statusEl.textContent = 'No API key — paste your eBay App ID above.';
      statusEl.className   = 'lookup-status err';
      return;
    }

    if (btn)     btn.disabled        = true;
    if (labelEl) labelEl.textContent = 'Fetching...';
    statusEl.textContent = '';
    statusEl.className   = 'lookup-status';

    try {
      const median = await fetchPrice(keywords, categoryId);
      if (median === null) {
        statusEl.textContent = 'No recent sold listings found.';
        statusEl.className   = 'lookup-status err';
      } else {
        document.getElementById('f-price').value = median.toFixed(2);
        statusEl.textContent = `Median $${median.toFixed(2)} AUD from recent sold listings`;
        statusEl.className   = 'lookup-status ok';
      }
    } catch (err) {
      statusEl.textContent = `Lookup failed: ${err.message}`;
      statusEl.className   = 'lookup-status err';
    } finally {
      if (btn)     btn.disabled        = false;
      if (labelEl) labelEl.textContent = 'Fetch price';
    }
  }

  /* ─── Bulk price fetch ─── */
  async function bulkFetch() {
    if (!appId) {
      alert('Paste your eBay API key first.');
      return;
    }

    const items     = Listings.getItems();
    const unpriced  = items.map((c, i) => ({ card: c, index: i }))
                           .filter(({ card }) => !card.price || card.price === 0);

    if (unpriced.length === 0) {
      alert('All cards already have prices.');
      return;
    }

    const btn       = document.getElementById('bulk-fetch-btn');
    const statusEl  = document.getElementById('bulk-status');
    btn.disabled    = true;
    statusEl.style.display = 'block';

    let success = 0, failed = 0;

    for (let i = 0; i < unpriced.length; i++) {
      const { card, index } = unpriced[i];
      statusEl.textContent  = `Fetching ${i + 1} of ${unpriced.length}: ${card.number || card.name}...`;

      try {
        const keywords   = buildKeywords(card);
        const categoryId = card.game === 'pokemon' ? '2536' : '183454';
        const median     = await fetchPrice(keywords, categoryId);

        if (median !== null) {
          Listings.updatePrice(index, median);
          success++;
        } else {
          failed++;
        }
      } catch(e) {
        failed++;
      }

      // Delay between requests to avoid rate limiting
      if (i < unpriced.length - 1) {
        await new Promise(r => setTimeout(r, 600));
      }
    }

    statusEl.textContent = `Done — ${success} priced, ${failed} not found.`;
    btn.disabled = false;

    // Refresh render to show new prices
    Listings.render();

    setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
  }

  function setStatus(elId, msg, type) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.className   = `lookup-status ${type}`;
  }

  return { save, lookup, bulkFetch };
})();
