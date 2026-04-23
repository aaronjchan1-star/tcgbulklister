/**
 * api.js
 * eBay Finding API — last sold price lookup by card number.
 * Works for both One Piece and Pokémon.
 *
 * Uses allorigins CORS proxy to call eBay Finding API (no OAuth needed for Finding API).
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

  async function lookup() {
    const game = Listings.getGame();

    let keywords, statusEl, labelEl, btn;

    if (game === 'onePiece') {
      const cardNumber = document.getElementById('f-op-number').value.trim().toUpperCase();
      const lang       = document.getElementById('f-op-lang').value;
      if (!cardNumber) {
        document.getElementById('lookup-status').textContent = 'Enter a card number first.';
        document.getElementById('lookup-status').className   = 'lookup-status err';
        return;
      }
      keywords  = `${cardNumber} One Piece TCG SR ${lang}`;
      statusEl  = document.getElementById('lookup-status');
      labelEl   = document.getElementById('lookup-label');
      btn       = document.getElementById('btn-lookup');
    } else {
      const setName = document.getElementById('f-pk-set').selectedOptions[0]?.text || '';
      const number  = document.getElementById('f-pk-number').value.trim();
      const name    = document.getElementById('f-pk-name').value.trim();
      if (!number) {
        document.getElementById('pk-lookup-status').textContent = 'Enter a card number first.';
        document.getElementById('pk-lookup-status').className   = 'lookup-status err';
        return;
      }
      keywords = `${name || ''} ${setName} ${number} Pokémon TCG`.trim();
      statusEl = document.getElementById('pk-lookup-status');
      labelEl  = null;
      btn      = null;
    }

    if (!appId) {
      statusEl.textContent = 'No API key saved — paste your eBay App ID above.';
      statusEl.className   = 'lookup-status err';
      return;
    }

    if (btn)    btn.disabled     = true;
    if (labelEl) labelEl.textContent = 'Fetching...';
    statusEl.textContent = '';
    statusEl.className   = 'lookup-status';

    try {
      const categoryId = game === 'pokemon' ? '2536' : '183454';

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

      const res   = await fetch(PROXY + encodeURIComponent(findingUrl));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const outer = await res.json();
      const data  = JSON.parse(outer.contents);
      const root  = data?.findCompletedItemsResponse?.[0];
      const ack   = root?.ack?.[0];

      if (ack !== 'Success') {
        const errMsg = root?.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'eBay returned an error.';
        throw new Error(errMsg);
      }

      const items = root?.searchResult?.[0]?.item;
      if (!items || items.length === 0) {
        statusEl.textContent = 'No recent sold listings found.';
        statusEl.className   = 'lookup-status err';
        return;
      }

      const prices = items
        .map(i => parseFloat(i?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__))
        .filter(p => !isNaN(p) && p > 0)
        .sort((a, b) => a - b);

      if (prices.length === 0) throw new Error('Could not parse prices.');

      const median   = prices[Math.floor(prices.length / 2)];
      const endTime  = items[0]?.listingInfo?.[0]?.endTime?.[0] || '';
      const soldDate = endTime ? new Date(endTime).toLocaleDateString('en-AU') : 'unknown date';

      document.getElementById('f-price').value = median.toFixed(2);

      statusEl.textContent = `${prices.length} sold listing${prices.length > 1 ? 's' : ''} — median $${median.toFixed(2)} AUD (last sold ${soldDate})`;
      statusEl.className   = 'lookup-status ok';

    } catch (err) {
      statusEl.textContent = `Lookup failed: ${err.message}`;
      statusEl.className   = 'lookup-status err';
    } finally {
      if (btn)    btn.disabled = false;
      if (labelEl) labelEl.textContent = 'Fetch price';
    }
  }

  return { save, lookup };
})();
