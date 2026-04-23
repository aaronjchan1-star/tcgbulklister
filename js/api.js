/**
 * api.js
 * Handles eBay API key storage and last-sold price lookup.
 *
 * eBay Browse API is used (search/item_summary/search with filter=buyingOptions:{FIXED_PRICE}
 * and a sold items filter via the "completedItems" approach via Finding API).
 *
 * NOTE: eBay's Browse API does NOT expose sold/completed listings directly —
 * that requires the Finding API (findCompletedItems). We use a CORS proxy
 * (allorigins) to call the Finding API with your App ID (no OAuth needed for Finding API).
 *
 * Finding API endpoint:
 * https://svcs.ebay.com/services/search/FindingService/v1
 *   ?OPERATION-NAME=findCompletedItems
 *   &SERVICE-VERSION=1.0.0
 *   &SECURITY-APPNAME={APP_ID}
 *   &RESPONSE-DATA-FORMAT=JSON
 *   &keywords={card_number}+One+Piece+TCG+SR
 *   &categoryId=183454
 *   &itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true
 *   &itemFilter(1).name=Currency&itemFilter(1).value=AUD
 *   &sortOrder=EndTimeSoonest
 *   &paginationInput.entriesPerPage=5
 */

const API = (() => {
  const STORAGE_KEY = 'ebay_app_id';
  const PROXY = 'https://api.allorigins.win/get?url=';
  const FINDING_ENDPOINT = 'https://svcs.ebay.com/services/search/FindingService/v1';

  let appId = localStorage.getItem(STORAGE_KEY) || '';

  function save() {
    const val = document.getElementById('api-key-input').value.trim();
    const statusEl = document.getElementById('api-status');
    if (!val) {
      statusEl.textContent = 'Please paste your Client ID first.';
      statusEl.className = 'api-status err';
      return;
    }
    appId = val;
    localStorage.setItem(STORAGE_KEY, val);
    statusEl.textContent = 'Key saved. Ready to fetch prices.';
    statusEl.className = 'api-status ok';
  }

  function getAppId() {
    return appId;
  }

  /**
   * Look up the last sold price on eBay AU for a given card number + language.
   * Card number format: OP01-001, OP15-060, ST07-003 etc.
   * Returns { price: number, title: string, soldDate: string } or throws.
   */
  async function lookup() {
    const cardNumber = document.getElementById('f-number').value.trim().toUpperCase();
    const lang       = document.getElementById('f-lang').value;
    const statusEl   = document.getElementById('lookup-status');
    const labelEl    = document.getElementById('lookup-label');
    const btn        = document.getElementById('btn-lookup');

    if (!cardNumber) {
      statusEl.textContent = 'Enter a card number first (e.g. OP01-001).';
      statusEl.className = 'lookup-status err';
      return;
    }

    if (!appId) {
      statusEl.textContent = 'No API key saved — paste your eBay App ID above.';
      statusEl.className = 'lookup-status err';
      return;
    }

    btn.disabled = true;
    labelEl.textContent = 'Fetching...';
    statusEl.textContent = '';
    statusEl.className = 'lookup-status';

    try {
      const langTag = lang === 'Japanese' ? 'Japanese' : 'English';
      const keywords = encodeURIComponent(`${cardNumber} One Piece TCG SR ${langTag}`);

      const findingUrl = [
        FINDING_ENDPOINT,
        '?OPERATION-NAME=findCompletedItems',
        '&SERVICE-VERSION=1.0.0',
        `&SECURITY-APPNAME=${encodeURIComponent(appId)}`,
        '&RESPONSE-DATA-FORMAT=JSON',
        `&keywords=${keywords}`,
        '&categoryId=183454',
        '&itemFilter(0).name=SoldItemsOnly',
        '&itemFilter(0).value=true',
        '&itemFilter(1).name=Currency',
        '&itemFilter(1).value=AUD',
        '&itemFilter(2).name=ListingType',
        '&itemFilter(2).value=FixedPrice',
        '&sortOrder=EndTimeSoonest',
        '&paginationInput.entriesPerPage=5',
        '&outputSelector=SellerInfo'
      ].join('');

      const proxyUrl = PROXY + encodeURIComponent(findingUrl);
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const outer = await res.json();
      const data = JSON.parse(outer.contents);

      const root = data?.findCompletedItemsResponse?.[0];
      const ack  = root?.ack?.[0];

      if (ack !== 'Success') {
        const errMsg = root?.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'eBay returned an error.';
        throw new Error(errMsg);
      }

      const items = root?.searchResult?.[0]?.item;
      if (!items || items.length === 0) {
        statusEl.textContent = `No recent sold listings found for ${cardNumber} (${langTag}).`;
        statusEl.className = 'lookup-status err';
        return;
      }

      // Grab prices from results and take the median to avoid outliers
      const prices = items
        .map(i => parseFloat(i?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__))
        .filter(p => !isNaN(p) && p > 0)
        .sort((a, b) => a - b);

      if (prices.length === 0) throw new Error('Could not parse prices from results.');

      const median = prices[Math.floor(prices.length / 2)];
      const lastTitle = items[0]?.title?.[0] || cardNumber;
      const endTime = items[0]?.listingInfo?.[0]?.endTime?.[0] || '';
      const soldDate = endTime ? new Date(endTime).toLocaleDateString('en-AU') : 'unknown date';

      // Populate form fields
      document.getElementById('f-price').value = median.toFixed(2);

      // Try to extract card name from listing title (strip known patterns)
      if (!document.getElementById('f-name').value) {
        const guessedName = lastTitle
          .replace(/one piece/gi, '')
          .replace(/tcg/gi, '')
          .replace(/\bsr\b/gi, '')
          .replace(new RegExp(cardNumber, 'gi'), '')
          .replace(/english|japanese/gi, '')
          .replace(/near mint|nm|lightly played|lp/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        document.getElementById('f-name').value = guessedName;
      }

      statusEl.textContent = `Found ${prices.length} sold listing${prices.length > 1 ? 's' : ''} — median $${median.toFixed(2)} AUD (last sold ${soldDate})`;
      statusEl.className = 'lookup-status ok';

    } catch (err) {
      statusEl.textContent = `Lookup failed: ${err.message}`;
      statusEl.className = 'lookup-status err';
    } finally {
      btn.disabled = false;
      labelEl.textContent = 'Fetch price';
    }
  }

  // On load: restore saved key
  window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      document.getElementById('api-key-input').value = saved;
      const statusEl = document.getElementById('api-status');
      statusEl.textContent = 'Saved key loaded.';
      statusEl.className = 'api-status ok';
    }
  });

  return { save, lookup, getAppId };
})();
