/** v2.1
 * listings.js
 * Manages listings — add, remove, render, save/load via localStorage.
 */

const Listings = (() => {
  const OP_CDN      = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece';
  const PKM_IMG     = 'https://images.pokemontcg.io';
  const STORAGE_KEY = 'tcg_listings';

  let items       = [];
  let currentGame = 'onePiece';

  // Strip parenthetical set codes from stored names
  // Handles: "Nami (OP14" → "Nami", "Luffy (OP12" → "Luffy"
  // But preserves legitimate parentheses in names like "Monkey D. Luffy"
  function cleanName(name) {
    if (!name) return '';
    // Remove trailing ( followed by set code pattern e.g. (OP12, (EB01, (PRB02
    return name.replace(/\s*\([A-Z]{1,4}\d{1,2}.*$/, '').trim();
  }

  function sanitiseCard(card) {
    if (card.name) card.name = cleanName(card.name);
    return card;
  }

  function setGame(game) { currentGame = game; }
  function getGame()     { return currentGame; }

  function getPostage() {
    const sel = document.getElementById('f-post').value;
    if (sel === 'custom') return parseFloat(document.getElementById('f-custom-post').value) || 0;
    return parseFloat(sel);
  }

  function imageUrl(item) {
    if (item.imageUrl) return item.imageUrl;
    if (item.game === 'pokemon') return `${PKM_IMG}/${item.setId}/${item.number}_hires.png`;
    const set     = item.number.split('-')[0].toUpperCase();
    const suffix  = item.variant?.suffix || '';
    const langTag = item.lang === 'Japanese' ? 'JP' : 'EN';
    return `${OP_CDN}/${set}/${item.number}${suffix}_${langTag}.webp`;
  }

  function imageUrlFromFields(game) {
    if (game === 'pokemon') return null;
    const variant = UI.getSelectedOPVariant();
    if (variant) return variant.url;
    const number  = document.getElementById('f-op-number').value.trim().toUpperCase();
    const lang    = document.getElementById('f-op-lang').value;
    if (!number || !number.includes('-')) return null;
    const set     = number.split('-')[0];
    return `${OP_CDN}/${set}/${number}_${lang === 'Japanese' ? 'JP' : 'EN'}.webp`;
  }

  async function add() {
    const price = parseFloat(document.getElementById('f-price').value) || 0;
    const post  = getPostage();
    let card;

    if (currentGame === 'onePiece') {
      const number  = document.getElementById('f-op-number').value.trim().toUpperCase();
      const name    = document.getElementById('f-op-name').value.trim();
      const lang    = document.getElementById('f-op-lang').value;
      const cond    = document.getElementById('f-op-cond').value;
      const qty         = parseInt(document.getElementById('f-op-qty').value) || 1;
      const rarity      = document.getElementById('f-op-rarity')?.value || 'SR';
      const _ltype = UI.getListingType ? UI.getListingType() : 'lot-1';
      const listingType = _ltype === 'playset' ? 'playset' : 'lot';
      const lotQty = (listingType === 'lot' || listingType === 'playset')
        ? (UI.getLotQty ? UI.getLotQty() : parseInt(document.getElementById('f-op-qty').value) || 1)
        : qty;
      const variant     = UI.getSelectedOPVariant();

      if (!number) {
        const s = document.getElementById('save-status');
        if (s) { s.textContent = 'Enter a card number first.'; s.style.opacity='1'; setTimeout(()=>s.style.opacity='0',3000); }
        return;
      }
      // Lot/playset listings don't need variant image search
      if (listingType === 'variation' && !variant) {
        const s = document.getElementById('save-status');
        if (s) { s.textContent = 'Press Enter to search for the card first.'; s.style.opacity='1'; setTimeout(()=>s.style.opacity='0',3000); }
        return;
      }

      // Wait for card details fetch to complete (has name, type, effects)
      if (window._cardDetailsPending) {
        try { await window._cardDetailsPending; } catch(e) {}
        window._cardDetailsPending = null;
      }
      // Always re-read name from form after fetch (may have been auto-populated)
      const nameEl = document.getElementById('f-op-name');
      if (nameEl && nameEl.value.trim() && nameEl.value.trim() !== number) {
        name = nameEl.value.trim();
      }
      // Also use name from fetched card details if available
      if (window._currentCardDetails?.name && (!name || name === number)) {
        name = window._currentCardDetails.name.replace(/\s*\([A-Z]{1,4}\d{1,2}.*/i, '').trim();
      }

      card = {
        game: 'onePiece',
        number,
        name: name || number,
        lang,
        cond,
        qty,
        price,
        post,
        rarity,
        listingType,
        qty: listingType === 'lot' ? lotQty : qty,
        // Use actual rarity from Limitless if available
        variant: variant
          ? { suffix: variant.suffix, label: variant.label }
          : { suffix: '', label: window._currentCardDetails?.rarity || rarity || '' },
        imageUrl:         variant?.url || null,
        limitlessSetName: window._currentOPSetName || null,
        cardDetails:      window._currentCardDetails || null
      };
      window._currentOPSetName   = null;
      window._currentCardDetails = null;

    } else {
      const selected = UI.getSelectedPokemonCard();
      if (!selected) {
        const s = document.getElementById('save-status');
        if (s) { s.textContent = 'Search for a card first, then click the image.'; s.style.opacity='1'; setTimeout(()=>s.style.opacity='0',3000); }
        return;
      }
      const name = document.getElementById('f-pk-name').value.trim() || selected.name;
      const cond = document.getElementById('f-pk-cond').value;
      const qty  = parseInt(document.getElementById('f-pk-qty').value) || 1;
      const printedNum = `${selected.number}/${selected.set.printedTotal || selected.set.total}`;
      const variant = UI.getSelectedPokemonVariant ? UI.getSelectedPokemonVariant() : 'Normal';

      // Grab the TCGplayer price for the selected variant (USD)
      const prices = selected.tcgplayer?.prices || {};
      let usdPrice = null;
      if (variant === 'Holo')              usdPrice = prices.holofoil?.market || prices.holofoil?.mid;
      else if (variant === 'Reverse Holo') usdPrice = prices.reverseHolofoil?.market || prices.reverseHolofoil?.mid;
      else if (variant === 'Normal')       usdPrice = (prices.normal || prices.holofoil)?.market || (prices.normal || prices.holofoil)?.mid;

      card = {
        game:         'pokemon',
        setId:        selected.set.id,
        setName:      selected.set.name,
        number:       selected.number,
        printedNumber: printedNum,
        name,
        rarity:       selected.rarity || null,
        variant,                          // Normal / Holo / Reverse Holo / Poke Ball / Master Ball
        tcgUsdPrice:  usdPrice || null,   // raw USD market price for reference
        imageUrl:     selected.images?.large || selected.images?.small || '',
        lang:         'English',
        cond,
        qty,
        price,
        post
      };
    }

    items.push(sanitiseCard(card));
    clearForm();
    save();
    render();
  }

  function clearForm() {
    if (currentGame === 'onePiece') {
      document.getElementById('f-op-number').value = '';
      document.getElementById('f-op-name').value   = '';
      document.getElementById('f-op-qty').value    = '1';
      document.getElementById('card-preview').style.display     = 'none';
      document.getElementById('op-card-picker').style.display   = 'none';
      document.getElementById('op-card-grid').innerHTML         = '';
      document.getElementById('lookup-status').textContent      = '';
      document.getElementById('f-op-number').focus();
    } else {
      document.getElementById('f-pk-number').value              = '';
      document.getElementById('f-pk-qty').value                 = '1';
      document.getElementById('pk-card-picker').style.display   = 'none';
      document.getElementById('pk-card-grid').innerHTML         = '';
      document.getElementById('pk-card-preview').style.display  = 'none';
      document.getElementById('pk-lookup-status').textContent   = '';
      document.getElementById('f-pk-name').value                = '';
      document.getElementById('f-pk-number').focus();
    }
    document.getElementById('f-price').value = '';
  }

  function remove(index) { items.splice(index, 1); save(); render(); }

  function updatePrice(index, price, priceData) {
    items[index].price = price;
    if (priceData) {
      items[index].priceLow      = priceData.low;
      items[index].priceHigh     = priceData.high;
      items[index].priceConf     = priceData.confidence;
      items[index].priceNotes    = priceData.notes;
      items[index].priceSource   = 'claude';
    }
    save();
    render();
  }

  function getAll()   { return items; }
  function getItems() { return items; }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      showSaveStatus('List saved');
      // Push to cloud sync if enabled
      if (window.Sync?.schedulePush) Sync.schedulePush();
    } catch(e) { console.warn('Save failed:', e); }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        items = JSON.parse(raw).map(sanitiseCard);
        render();
        if (items.length > 0) showSaveStatus(`Loaded ${items.length} card${items.length !== 1 ? 's' : ''} from last session`);
      }
    } catch(e) { console.warn('Load failed:', e); }
  }

  function clearAll() {
    if (items.length === 0) { showSaveStatus('Nothing to clear'); return; }
    // Use custom confirm UI instead of browser confirm() which can be blocked
    const bar = document.getElementById('clear-confirm-bar');
    if (bar) {
      bar.style.display = bar.style.display === 'none' || !bar.style.display ? 'flex' : 'none';
      document.getElementById('clear-confirm-count').textContent = items.length;
      return;
    }
    // Fallback if bar doesn't exist
    items = [];
    try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
    render();
    showSaveStatus('List cleared');
  }

  function clearAllConfirmed() {
    const bar = document.getElementById('clear-confirm-bar');
    if (bar) bar.style.display = 'none';
    items = [];
    try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
    render();
    showSaveStatus('List cleared');
  }

  function clearAllCancelled() {
    const bar = document.getElementById('clear-confirm-bar');
    if (bar) bar.style.display = 'none';
  }

  function showSaveStatus(msg) {
    const el = document.getElementById('save-status');
    if (!el) return;
    el.textContent   = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 2500);
  }

  function gameLabel(item)      { return item.game === 'pokemon' ? 'Pokémon' : 'One Piece'; }
  function gameBadgeClass(item) { return item.game === 'pokemon' ? 'badge-pk' : 'badge-op'; }

    const SET_NAMES = {
    EB01:'Memorial Collection', EB02:'Anime 25th Collection',
    EB03:'Heroines Edition', EB04:"Adventure on Kami's Island",
    OP01:'Romance Dawn', OP02:'Paramount War', OP03:'Pillars of Strength',
    OP04:'Kingdoms of Intrigue', OP05:'Awakening of the New Era',
    OP06:'Wings of the Captain', OP07:'500 Years in the Future',
    OP08:'Two Legends', OP09:'The Four Emperors', OP10:'Royal Blood',
    OP11:'A Fist of Divine Speed', OP12:'Legacy of the Master',
    OP13:'Carrying on his Will', OP14:"The Azure Sea's Seven",
    OP15:"Adventure on Kami's Island",
    PRB01:'The Best Vol.1', PRB02:'The Best Vol.2',
    ST01:'Straw Hat Crew', ST02:'Worst Generation', ST03:'The Seven Warlords',
    ST04:'Animal Kingdom Pirates', ST05:'Worst Generation 2',
    ST06:'Absolute Justice', ST07:'Big Mom Pirates', ST08:'Monkey D. Luffy',
    ST09:'Yamato', ST10:'UTA', ST11:'Uta', ST12:'Zoro & Sanji',
    ST13:'The Three Captains', ST14:'3D2Y Luffy', ST15:'Red-Haired Pirates',
    ST16:'Marine', ST17:'Dark Forces', ST18:'World Government', ST19:'Final Chapter'
  };


  // Words that indicate bad scrape data — reject if found in set name
  const BAD_SET_WORDS = ['deck', 'latest', 'card', 'search', 'limitless', 'result', 'filter'];

  function isValidSetName(name) {
    if (!name || name.length < 3 || name.length > 60) return false;
    const lower = name.toLowerCase();
    return !BAD_SET_WORDS.some(w => lower.includes(w));
  }

  function subLabel(item) {
    if (item.game === 'pokemon') {
      const v = item.variant && item.variant !== 'Normal' ? ` · ${item.variant}` : '';
      return (item.setName || item.setId) + v;
    }
    const setCode = item.number?.split('-')[0]?.toUpperCase() || '';
    // Only use Limitless set name if it passes validation
    const limitless = isValidSetName(item.limitlessSetName) ? item.limitlessSetName : null;
    const setName   = limitless || SET_NAMES[setCode] || setCode;
    const lang      = item.lang === 'Japanese' ? 'JP · ' : '';
    return `${lang}${setName}`;
  }

  function ebayLinkCell(item) {
    const url = API.getEbayUrl(item);
    return `<a href="${url}" target="_blank" class="ebay-search-btn" title="Search eBay AU sold listings">eBay ↗</a>`;
  }

  function listingTypeLabel(item) {
    if (item.listingType === 'playset' || item.variant?.label === 'Playset') return 'Playset (4x)';
    if (item.listingType === 'lot') {
      const q = item.qty || 1;
      if (q === 1) return 'Single';
      if (q === 2) return 'Pair';
      if (q === 3) return 'Triple';
      return `${q}x`;
    }
    return 'Single';
  }

  function listingTypeCss(item) {
    if (item.listingType === 'playset') return 'type-playset';
    if (item.listingType === 'lot') return 'type-lot';
    return 'type-set';
  }

  function displayNumber(item) {
    return item.game === 'pokemon' ? (item.printedNumber || item.number) : item.number;
  }

  function buildEbaySearchUrl(item) {
    const name     = cleanName(item.name) || item.number;
    const isPlayset = item.listingType === 'playset';
    const isLot     = item.listingType === 'lot' && item.qty > 1;
    let q = `${item.number} ${name} One Piece`;
    if (item.lang === 'Japanese') q += ' Japanese';
    if (isPlayset) q += ' playset';
    else if (isLot) q += ` ${item.qty}x`;
    q += ' -PSA -BGS -CGC -graded -slab';
    const p = new URLSearchParams({ _nkw: q, LH_Sold: '1', LH_Complete: '1', LH_PrefLoc: '1', _sop: '13' });
    return `https://www.ebay.com.au/sch/i.html?${p.toString()}`;
  }

  function priceCell(item, index) {
    const val       = item.price && item.price > 0 ? item.price.toFixed(2) : '';
    const confColor = item.priceConf === 'high' ? 'var(--green)' : item.priceConf === 'low' ? 'var(--amber)' : 'var(--text)';
    const confDot   = item.priceSource
      ? `<span title="${item.priceConf || ''} confidence${item.priceNotes ? ': ' + item.priceNotes : ''}" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${confColor};margin-left:4px;vertical-align:middle;cursor:help;"></span>`
      : '';
    const ebayUrl = buildEbaySearchUrl(item);
    return `<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
      <input
        type="number"
        class="price-inline ${!val ? 'price-unset' : ''}"
        value="${val}"
        placeholder="0.00"
        step="0.50"
        min="0"
        onchange="Listings.updatePrice(${index}, parseFloat(this.value) || 0)"
        onclick="this.select()"
        title="Type price manually"
        style="width:70px;"
      />${confDot}
      <a href="${ebayUrl}" target="_blank" class="price-ebay-link" title="Search eBay AU sold listings" style="font-size:11px;white-space:nowrap;">eBay AU ↗</a>
    </div>`;
  }

  function render() {
    const list  = document.getElementById('listings-list');
    const empty = document.getElementById('empty-msg');
    const bar   = document.getElementById('action-bar');
    const unpricedCount = items.filter(l => !l.price || l.price === 0).length;

    if (items.length === 0) {
      empty.style.display = 'block';
      list.innerHTML      = '';
      bar.style.display   = 'none';
    } else {
      empty.style.display = 'none';
      bar.style.display   = 'block';
      list.innerHTML = items.map((l, i) => `
        <div class="listing-row ${(!l.price || l.price === 0) ? 'row-unpriced' : ''}">
          <img class="card-thumb" src="${imageUrl(l)}" alt="${l.name}" onerror="this.style.display='none'" />
          <span><span class="badge ${gameBadgeClass(l)}">${gameLabel(l)}</span></span>
          <span class="mono">${displayNumber(l)}</span>
          <span class="listing-name" title="${cleanName(l.name)}">${cleanName(l.name)}</span>
          <span class="muted" title="${subLabel(l)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${subLabel(l)}</span>
          <span class="muted">${l.cond === 'Near Mint' ? 'NM' : l.cond === 'Lightly Played' ? 'LP' : l.cond === 'Moderately Played' ? 'MP' : l.cond}</span>
          <span class="listing-type-label ${listingTypeCss(l)}">${listingTypeLabel(l)}</span>
          ${priceCell(l, i)}
          ${ebayLinkCell(l)}
          <span class="muted">${l.post === 0 ? 'Free' : '$' + l.post.toFixed(2)}</span>
          <button class="remove-btn" onclick="Listings.remove(${i})" title="Remove">&#x2715;</button>
        </div>
      `).join('');

      const bulkBtn = document.getElementById('bulk-fetch-btn');
      if (bulkBtn) {
        bulkBtn.style.display = unpricedCount > 0 ? 'block' : 'none';
        bulkBtn.textContent   = `Fetch prices for ${unpricedCount} unpriced card${unpricedCount !== 1 ? 's' : ''}`;
      }
    }
    updateStats();
  }

  function updateStats() {
    const totalUnits = items.reduce((s, l) => s + l.qty, 0);
    const totalVal   = items.reduce((s, l) => s + (l.price || 0) * l.qty, 0);
    const unpriced   = items.filter(l => !l.price || l.price === 0).length;
    document.getElementById('stat-count').textContent = totalUnits;
    document.getElementById('stat-total').textContent = '$' + totalVal.toFixed(2);
    document.getElementById('stat-avg').textContent   = totalUnits > 0 ? '$' + (totalVal / totalUnits).toFixed(2) : '—';
    const u = document.getElementById('stat-unpriced');
    if (u) u.textContent = unpriced;
  }

  function replaceAll(newItems) {
    items = newItems.map(sanitiseCard);
    save();
    render();
  }

  function addAll(newItems) {
    items = [...items, ...newItems.map(sanitiseCard)];
    save();
    render();
  }

  return { add, remove, updatePrice, getAll, getItems, getGame, setGame, render, load, save, clearAll, clearAllConfirmed, clearAllCancelled, replaceAll, addAll, imageUrl, imageUrlFromFields };
})();
