/**
 * api.js
 * Calls the Vercel serverless /api/price endpoint which proxies eBay server-side.
 * Falls back to opening eBay search tab if the function is unavailable.
 */

const API = (() => {
  const STORAGE_KEY = 'ebay_app_id';
  const EBAY_SOLD   = 'https://www.ebay.com.au/sch/i.html?LH_Sold=1&LH_Complete=1&_sacat=0&_nkw=';

  // Vercel function endpoint — works when deployed to Vercel
  // Falls back gracefully if running locally (just opens eBay tab instead)
  const API_ENDPOINT = '/api/price';

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

  function buildKeywords(card) {
    if (card.game === 'onePiece') {
      const variant = card.variant?.label && card.variant.label !== 'Standard'
        ? ` ${card.variant.label}` : '';
      return `${card.number}${variant} One Piece${card.lang === 'Japanese' ? ' Japanese' : ''}`;
    }
    return `${card.name} ${card.setName} Pokemon`.trim();
  }

  function buildSearchKeywords(game) {
    if (game === 'onePiece') {
      const number  = document.getElementById('f-op-number').value.trim().toUpperCase();
      const lang    = document.getElementById('f-op-lang').value;
      const name    = document.getElementById('f-op-name').value.trim();
      const variant = UI.getSelectedOPVariant();
      const variantLabel = variant?.label && variant.label !== 'Standard' ? ` ${variant.label}` : '';
      return `${number}${variantLabel}${name ? ' ' + name : ''} One Piece${lang === 'Japanese' ? ' Japanese' : ''}`;
    }
    const name    = document.getElementById('f-pk-name').value.trim();
    const selected = UI.getSelectedPokemonCard();
    const setName  = selected?.set?.name || '';
    return `${name} ${setName} Pokemon`.trim();
  }

  async function fetchFromVercel(keywords, categoryId) {
    if (!appId) throw new Error('no_key');

    const url = `${API_ENDPOINT}?keywords=${encodeURIComponent(keywords)}&categoryId=${categoryId}&appId=${encodeURIComponent(appId)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) throw new Error(`server_${res.status}`);
    return await res.json();
  }

  function showPriceResult(result, statusEl) {
    if (!result.price) {
      statusEl.innerHTML = `No recent ungraded AU sold listings found. <a href="${result.ebayUrl}" target="_blank" style="color:var(--amber);">Check eBay ↗</a>`;
      statusEl.className = 'lookup-status err';
      return false;
    }

    const range    = result.lowest !== result.highest
      ? `, range $${result.lowest.toFixed(2)}–$${result.highest.toFixed(2)}`
      : '';
    const filtered = result.filtered > 0
      ? ` <span style="color:var(--text-muted);">(${result.filtered} graded excluded)</span>`
      : '';

    statusEl.innerHTML = `
      Median <strong style="color:var(--green);">$${result.price.toFixed(2)} AUD</strong>
      from ${result.count} ungraded listing${result.count !== 1 ? 's' : ''}
      ${result.soldDate ? '· last sold ' + result.soldDate : ''}${range}.${filtered}
      <a href="${result.ebayUrl}" target="_blank" style="color:var(--accent); margin-left:6px;">Verify on eBay ↗</a>
    `;
    statusEl.className = 'lookup-status ok';
    return true;
  }

  /* ─── Single lookup from form ─── */
  async function lookup() {
    const game = Listings.getGame();
    let keywords, statusEl, labelEl, btn, categoryId;

    if (game === 'onePiece') {
      const number = document.getElementById('f-op-number').value.trim().toUpperCase();
      if (!number) { setStatus('lookup-status', 'Enter a card number first.', 'err'); return; }
      keywords   = buildSearchKeywords('onePiece');
      categoryId = '183454';
      statusEl   = document.getElementById('lookup-status');
      labelEl    = document.getElementById('lookup-label');
      btn        = document.getElementById('btn-lookup');
    } else {
      const name = document.getElementById('f-pk-name').value.trim();
      if (!name) { setStatus('pk-lookup-status', 'Search for a card first.', 'err'); return; }
      keywords   = buildSearchKeywords('pokemon');
      categoryId = '2536';
      statusEl   = document.getElementById('pk-lookup-status');
      labelEl    = null;
      btn        = null;
    }

    if (!appId) {
      // No key — just open eBay tab as fallback
      window.open(EBAY_SOLD + encodeURIComponent(keywords), '_blank');
      const s = game === 'onePiece' ? document.getElementById('lookup-status') : document.getElementById('pk-lookup-status');
      s.innerHTML = `Opened eBay sold listings in new tab. <small style="color:var(--text-muted);">(Save your eBay App ID above for auto-pricing)</small>`;
      s.className = 'lookup-status ok';
      return;
    }

    if (btn)     btn.disabled        = true;
    if (labelEl) labelEl.textContent = 'Fetching...';
    statusEl.textContent = 'Fetching eBay AU sold prices...';
    statusEl.className   = 'lookup-status';

    try {
      const result = await fetchFromVercel(keywords, categoryId);
      const hasPrice = showPriceResult(result, statusEl);
      if (hasPrice) document.getElementById('f-price').value = result.price.toFixed(2);

    } catch(err) {
      if (err.message === 'no_key' || err.message?.includes('server_')) {
        // Vercel function not available — fall back to opening eBay tab
        window.open(EBAY_SOLD + encodeURIComponent(keywords), '_blank');
        statusEl.innerHTML = `Opened eBay sold listings in new tab — enter the price manually.`;
        statusEl.className = 'lookup-status ok';
      } else {
        statusEl.innerHTML = `Lookup failed: ${err.message}. <a href="${EBAY_SOLD + encodeURIComponent(keywords)}" target="_blank" style="color:var(--amber);">Check eBay ↗</a>`;
        statusEl.className = 'lookup-status err';
      }
    } finally {
      if (btn)     btn.disabled        = false;
      if (labelEl) labelEl.textContent = 'Check eBay';
    }
  }

  /* ─── Bulk price fetch ─── */
  async function bulkFetch() {
    const items    = Listings.getItems();
    const unpriced = items.map((c, i) => ({ card: c, index: i }))
                          .filter(({ card }) => !card.price || card.price === 0);

    if (unpriced.length === 0) { alert('All cards already have prices.'); return; }

    const btn      = document.getElementById('bulk-fetch-btn');
    const statusEl = document.getElementById('bulk-status');
    btn.disabled   = true;
    statusEl.style.display = 'block';

    if (!appId) {
      // No key — open tabs
      unpriced.forEach(({ card }, i) => {
        setTimeout(() => {
          window.open(EBAY_SOLD + encodeURIComponent(buildKeywords(card)), '_blank');
        }, i * 400);
      });
      statusEl.textContent = `Opened ${unpriced.length} eBay search tab${unpriced.length !== 1 ? 's' : ''} — enter prices manually.`;
      btn.disabled = false;
      setTimeout(() => { statusEl.style.display = 'none'; }, 8000);
      return;
    }

    let success = 0, failed = 0;

    for (let i = 0; i < unpriced.length; i++) {
      const { card, index } = unpriced[i];
      statusEl.textContent  = `Fetching ${i + 1} of ${unpriced.length}: ${card.number || card.name}...`;

      try {
        const keywords   = buildKeywords(card);
        const categoryId = card.game === 'pokemon' ? '2536' : '183454';
        const result     = await fetchFromVercel(keywords, categoryId);

        if (result.price) {
          Listings.updatePrice(index, result.price);
          success++;
        } else {
          failed++;
        }
      } catch(e) {
        failed++;
      }

      if (i < unpriced.length - 1) await new Promise(r => setTimeout(r, 600));
    }

    statusEl.innerHTML = `Done — <strong>${success}</strong> priced, <strong>${failed}</strong> not found on eBay AU.`;
    btn.disabled = false;
    Listings.render();
    setTimeout(() => { statusEl.style.display = 'none'; }, 6000);
  }

  function setStatus(elId, msg, type) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.className   = `lookup-status ${type}`;
  }

  return { save, lookup, bulkFetch };
})();
