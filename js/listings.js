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
    if (!card._id) card._id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    return card;
  }

  /* ─────────────── Bulk-lot selection ─────────────── */
  let selectMode  = false;
  let selectedIds = new Set();

  const GAME_LABELS = { onePiece:'One Piece', pokemon:'Pokémon', riftbound:'Riftbound', yugioh:'Yu-Gi-Oh!' };

  function toggleSelectMode() {
    selectMode = !selectMode;
    if (!selectMode) selectedIds.clear();
    render();
  }
  function isSelectMode() { return selectMode; }

  function toggleSelect(id) {
    if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
    render();
  }

  function selectAllGame(game) {
    items.forEach(it => { if (it.game === game && it.listingType !== 'bulk') selectedIds.add(it._id); });
    render();
  }

  function clearSelection() { selectedIds.clear(); render(); }

  // The set a card belongs to (for grouping into variations listings)
  function setKeyOf(c) {
    if (c.game === 'pokemon') return c.setId || c.setName || '';
    return (c.number || '').split('-')[0].toUpperCase();   // OP09, EB04, LOCR, UNL...
  }
  function setNameOf(c) {
    if (c.setName) return c.setName;
    if (isValidSetName(c.limitlessSetName)) return c.limitlessSetName;
    return (typeof SET_NAMES !== 'undefined' && SET_NAMES[setKeyOf(c)]) || setKeyOf(c);
  }

  function getSelectionInfo() {
    const sel = items.filter(it => selectedIds.has(it._id) && it.listingType !== 'bulk' && it.listingType !== 'variations');
    const games = [...new Set(sel.map(c => c.game))];
    const sets  = [...new Set(sel.map(c => c.game + '|' + setKeyOf(c)))];
    return {
      count: sel.length,
      games, game: games.length === 1 ? games[0] : null,
      sets,  set:  sets.length === 1 ? sets[0] : null,
      cards: sel
    };
  }

  // Distinct games currently present (for quick-select chips)
  function gamesPresent() {
    return [...new Set(items.filter(it => it.listingType !== 'bulk').map(c => c.game))];
  }

  function createBulkFromSelected(price) {
    const info = getSelectionInfo();
    if (info.count < 2)  return { error: 'Select at least 2 cards for a bulk lot.' };
    if (!info.game)      return { error: 'A bulk lot must be a single game. You have ' + info.games.map(g => GAME_LABELS[g] || g).join(' + ') + ' selected.' };

    const conds = [...new Set(info.cards.map(c => c.cond))];
    const totalCards = info.cards.reduce((s, c) => s + (c.qty || 1), 0);

    const bulk = sanitiseCard({
      game:        info.game,
      listingType: 'bulk',
      bulkItems:   info.cards.map(c => ({
        number: c.number, name: c.name, cond: c.cond,
        qty: c.qty || 1,
        variant: typeof c.variant === 'string' ? c.variant : (c.variant?.label || '')
      })),
      bulkCount:   totalCards,
      name:        `${totalCards} ${GAME_LABELS[info.game]} Cards Bulk Lot`,
      number:      '',
      cond:        conds.length === 1 ? conds[0] : 'Mixed',
      qty:         1,
      price:       price || 0,
      post:        0,
      lang:        'English',
      variant:     { suffix: '', label: '' }
    });

    // Remove the individual cards that went into the bulk, then add the bulk listing
    items = items.filter(it => !selectedIds.has(it._id));
    items.push(bulk);
    selectedIds.clear();
    selectMode = false;
    save();
    render();
    return { ok: true, count: totalCards, game: GAME_LABELS[info.game] };
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
    if (item.listingType === 'bulk') return '';
    if (item.game === 'pokemon') {
      // Only build a URL when we actually resolved a set id + numeric card number
      const num = (item.number || '').split('/')[0];
      if (item.setId && num) return `${PKM_IMG}/${item.setId}/${num}_hires.png`;
      return '';  // unresolved → let onerror hide it instead of loading a wrong image
    }
    const num = item.number || '';
    if (!num.includes('-')) return '';
    const set     = num.split('-')[0].toUpperCase();
    const suffix  = item.variant?.suffix || '';
    const langTag = item.lang === 'Japanese' ? 'JP' : 'EN';
    return `${OP_CDN}/${set}/${num}${suffix}_${langTag}.webp`;
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
    const pickedRarity = (window.UI && UI.getRarity) ? UI.getRarity() : '';
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
          ? { suffix: variant.suffix, label: pickedRarity || variant.label }
          : { suffix: '', label: pickedRarity || window._currentCardDetails?.rarity || rarity || '' },
        imageUrl:         variant?.url || null,
        limitlessSetName: window._currentOPSetName || null,
        cardDetails:      window._currentCardDetails || null
      };
      window._currentOPSetName   = null;
      window._currentCardDetails = null;

    } else if (currentGame === 'riftbound' || currentGame === 'yugioh') {
      const g       = currentGame;
      const prefix  = g === 'riftbound' ? 'f-rb' : 'f-ygo';
      const number  = document.getElementById(`${prefix}-number`).value.trim().toUpperCase();
      const nameVal = document.getElementById(`${prefix}-name`).value.trim();
      const cond    = document.getElementById(`${prefix}-cond`).value;
      const qty     = parseInt(document.getElementById(`${prefix}-qty`).value) || 1;

      if (!number) {
        const s = document.getElementById('save-status');
        if (s) { s.textContent = 'Enter a card number first.'; s.style.opacity='1'; setTimeout(()=>s.style.opacity='0',3000); }
        return;
      }

      const _ltype = UI.getListingType ? UI.getListingType() : 'lot-1';
      const listingType = _ltype === 'playset' ? 'playset' : 'lot';
      const lotQty = UI.getLotQty ? UI.getLotQty() : qty;

      // Language: YGO detects from set code suffix
      let lang = 'English';
      if (g === 'yugioh') {
        const lc = number.match(/-([A-Z]{2})\d/)?.[1];
        lang = lc === 'JP' ? 'Japanese' : lc === 'AE' ? 'Asian-English' : lc === 'KR' ? 'Korean' : 'English';
      }

      const detected = window._currentCardDetails?.rarity || '';
      card = {
        game:            g,
        number,
        name:            nameVal || number,
        lang,
        cond,
        qty:             listingType === 'lot' ? lotQty : qty,
        price,
        post,
        listingType,
        variant:         { suffix: '', label: pickedRarity || detected || '' },
        imageUrl:        window._currentCardDetails?.imageUrl || null,
        limitlessSetName: window._currentOPSetName || null,
        cardDetails:     window._currentCardDetails || null
      };
      window._currentCardDetails = null;
      window._currentOPSetName   = null;

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
        rarity:       pickedRarity || selected.rarity || null,
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
      items[index].priceSource   = priceData.source || 'claude';
    }
    save();
    render();
  }

  function setMarketCheck(index, data) {
    if (items[index]) { items[index].marketCheck = data; save(); render(); }
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

  // Options for the inline rarity/finish picker
  const PK_FINISHES = ['Normal','Holo','Reverse Holo','Poke Ball','Master Ball'];
  function variantOptionsHtml(item) {
    if (item.game === 'pokemon') {
      const cur = typeof item.variant === 'string' ? item.variant : 'Normal';
      return PK_FINISHES.map(f => `<option value="${f}" ${f === cur ? 'selected' : ''}>${f}</option>`).join('');
    }
    // Other games: rarity list from RARITIES (loaded globally)
    const cur = item.variant?.label || '';
    const list = (typeof RARITIES !== 'undefined' && RARITIES[item.game]) ? RARITIES[item.game] : [{value:cur,label:cur||'—'}];
    let opts = list.map(o => `<option value="${o.value}" ${o.value === cur ? 'selected' : ''}>${o.label}</option>`).join('');
    if (cur && !list.some(o => o.value === cur)) opts = `<option value="${cur}" selected>${cur}</option>` + opts;
    return opts;
  }

  function setCardVariant(id, value) {
    const it = items.find(x => x._id === id);
    if (!it) return;
    if (it.game === 'pokemon') it.variant = value;
    else it.variant = { suffix: it.variant?.suffix || '', label: value };
    it.needsRarityCheck = false;   // user has confirmed it
    save();
    render();
  }

  function subLabel(item) {
    if (item.game === 'pokemon') {
      const v = item.variant && item.variant !== 'Normal' ? ` · ${item.variant}` : '';
      const set = item.setName || item.setId || (item.number ? `#${item.number}` : 'Pokémon');
      return set + v;
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
    if (item.listingType === 'bulk') return `Bulk (${item.bulkCount || '?'})`;
    if (item.listingType === 'playset' || item.variant?.label === 'Playset') return 'Playset (4x)';
    if (item.listingType === 'lot') {
      const q = item.qty || 1;
      return q > 1 ? `Qty ${q}` : 'Single';
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
    // Market check indicator
    let marketTag = '';
    if (item.marketCheck) {
      if (item.marketCheck.found === 0) {
        marketTag = `<span title="No active eBay AU listings found" style="font-size:10px;color:var(--text-muted);">no comps</span>`;
      } else if (item.marketCheck.verdict) {
        const v  = item.marketCheck.verdict;
        const mc = item.marketCheck;
        const units = mc.units || 1;
        const isBundle = units > 1 && mc.perListing;
        const shownPrice = isBundle ? mc.perListing : mc.soldEstimate;
        const matchInfo = mc.matches != null ? `${mc.matches} matched listing${mc.matches !== 1 ? 's' : ''}` : `${mc.found} listings`;
        const tip = isBundle
          ? `eBay AU (${matchInfo}): $${mc.soldEstimate}/card × ${units} cards (playset) = $${mc.perListing}`
          : `eBay AU (${matchInfo}): $${mc.soldEstimate}/card`;
        marketTag = `<span title="${tip}" style="font-size:10px;color:${v.color};white-space:nowrap;cursor:help;">● ${v.text} ($${shownPrice})</span>`;
      }
    }
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
      ${marketTag}
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
      renderSelectionBar();
      list.innerHTML = items.map((l, i) => {
        const isBulk = l.listingType === 'bulk';
        const isVary = l.listingType === 'variations';
        const isGroup = isBulk || isVary;
        const selectable = selectMode && !isGroup;
        const sel = selectedIds.has(l._id);
        const rowClick = selectable ? `onclick="Listings.toggleSelect('${l._id}')"` : '';
        const rowCls = `listing-row ${(!l.price || l.price === 0) ? 'row-unpriced' : ''} ${selectable ? 'selectable' : ''} ${sel ? 'selected' : ''}`;
        const checkbox = selectMode && !isGroup
          ? `<span class="sel-check">${sel ? '&#x2713;' : ''}</span>`
          : '';
        if (isVary) {
          const vi = l.variationItems || [];
          const prices = vi.map(c => c.price || 0).filter(p => p > 0);
          const lo = prices.length ? Math.min(...prices) : 0;
          const hi = prices.length ? Math.max(...prices) : 0;
          const priceRange = prices.length
            ? (lo === hi ? `$${lo.toFixed(2)}` : `$${lo.toFixed(2)}–$${hi.toFixed(2)}`)
            : '<span style="color:var(--amber)">price the cards first</span>';
          return `
            <div class="listing-row vary-row ${prices.length < vi.length ? 'row-unpriced' : ''}">
              <span style="font-size:20px;">&#x1F500;</span>
              <span><span class="badge ${gameBadgeClass(l)}">${gameLabel(l)}</span></span>
              <span class="mono">VARS</span>
              <span class="listing-name" title="${cleanName(l.name)}">${cleanName(l.name)}</span>
              <span class="muted" title="${vi.map(c=>c.number).join(', ')}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.variationCount} cards · buyer picks</span>
              <span class="muted">${l.cond === 'Near Mint' ? 'NM' : l.cond}</span>
              <span class="listing-type-label type-vary">Variations</span>
              <span style="font-size:12px;">${priceRange}</span>
              ${ebayLinkCell(l)}
              <span class="muted">${l.post === 0 ? 'Free' : '$' + l.post.toFixed(2)}</span>
              <button class="remove-btn" onclick="Listings.remove(${i})" title="Ungroup / remove">&#x2715;</button>
            </div>`;
        }
        if (isBulk) {
          return `
            <div class="listing-row bulk-row ${(!l.price || l.price === 0) ? 'row-unpriced' : ''}">
              <span style="font-size:20px;">&#x1F4E6;</span>
              <span><span class="badge ${gameBadgeClass(l)}">${gameLabel(l)}</span></span>
              <span class="mono">BULK</span>
              <span class="listing-name" title="${l.bulkCount} cards">${cleanName(l.name)}</span>
              <span class="muted" title="${(l.bulkItems||[]).map(c=>c.number).join(', ')}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.bulkCount} cards: ${(l.bulkItems||[]).slice(0,3).map(c=>c.number).join(', ')}${l.bulkCount>3?'…':''}</span>
              <span class="muted">${l.cond === 'Near Mint' ? 'NM' : l.cond === 'Mixed' ? 'Mixed' : l.cond}</span>
              <span class="listing-type-label type-bulk">Bulk lot</span>
              ${priceCell(l, i)}
              ${ebayLinkCell(l)}
              <span class="muted">${l.post === 0 ? 'Free' : '$' + l.post.toFixed(2)}</span>
              <button class="remove-btn" onclick="Listings.remove(${i})" title="Remove">&#x2715;</button>
            </div>`;
        }
        return `
        <div class="${rowCls}" ${rowClick}>
          ${checkbox}
          <img class="card-thumb" src="${imageUrl(l)}" alt="${l.name}" onerror="this.style.display='none'" />
          <span><span class="badge ${gameBadgeClass(l)}">${gameLabel(l)}</span></span>
          <span class="mono">${displayNumber(l)}</span>
          <span class="listing-name" title="${cleanName(l.name)}">${cleanName(l.name)}</span>
          <span class="variant-cell">
            <span class="set-tiny" title="${subLabel(l)}">${subLabel(l)}</span>
            <select class="variant-inline ${l.needsRarityCheck ? 'flagged' : ''}" onchange="event.stopPropagation(); Listings.setCardVariant('${l._id}', this.value)" onclick="event.stopPropagation()" title="Set rarity / finish">${variantOptionsHtml(l)}</select>
          </span>
          <span class="muted">${l.cond === 'Near Mint' ? 'NM' : l.cond === 'Lightly Played' ? 'LP' : l.cond === 'Moderately Played' ? 'MP' : l.cond}</span>
          <span class="listing-type-label ${listingTypeCss(l)} ${(l.qty>1 && l.listingType==='lot')?'qty-multi':''}">${listingTypeLabel(l)}</span>
          ${priceCell(l, i)}
          ${ebayLinkCell(l)}
          <span class="muted">${l.post === 0 ? 'Free' : '$' + l.post.toFixed(2)}</span>
          <button class="remove-btn" onclick="event.stopPropagation(); Listings.remove(${i})" title="Remove">&#x2715;</button>
        </div>`;
      }).join('');

      const bulkBtn = document.getElementById('bulk-fetch-btn');
      if (bulkBtn) {
        bulkBtn.style.display = unpricedCount > 0 ? 'block' : 'none';
        bulkBtn.textContent   = `Fetch prices for ${unpricedCount} unpriced card${unpricedCount !== 1 ? 's' : ''}`;
      }
    }
    updateStats();
  }

  function createVariationsFromSelected() {
    const info = getSelectionInfo();
    if (info.count < 2) return { error: 'Select at least 2 cards.' };
    if (!info.game)     return { error: 'A listing must be a single game. You have ' + info.games.map(g => GAME_LABELS[g] || g).join(' + ') + ' selected.' };
    if (!info.set)      return { error: 'Variations must all be from the SAME set. You have cards from ' + info.sets.length + ' different sets selected.' };
    if (info.count > 250) return { error: 'eBay allows up to ~250 variations per listing — select fewer.' };

    const setName = setNameOf(info.cards[0]);
    const totalQty = info.cards.reduce((s, c) => s + (c.qty || 1), 0);

    const v = sanitiseCard({
      game:        info.game,
      listingType: 'variations',
      variationItems: info.cards.map(c => ({
        number:        c.number,
        name:          c.name,
        cond:          c.cond,
        variant:       typeof c.variant === 'string' ? c.variant : (c.variant?.label || ''),
        price:         c.price || 0,
        qty:           c.qty || 1,
        imageUrl:      c.imageUrl || '',
        setId:         c.setId,
        printedNumber: c.printedNumber,
        lang:          c.lang
      })),
      setKey:         setKeyOf(info.cards[0]),
      setName,
      variationCount: info.count,
      name:           `${setName} Singles`,
      number:         '',
      cond:           info.cards[0].cond || 'Near Mint',
      qty:            totalQty,
      price:          0,
      post:           info.cards[0].post || 0,
      lang:           'English',
      variant:        { suffix: '', label: '' }
    });

    items = items.filter(it => !selectedIds.has(it._id));
    items.push(v);
    selectedIds.clear();
    selectMode = false;
    save();
    render();
    return { ok: true, count: info.count, set: setName };
  }

  function renderSelectionBar() {
    const bar = document.getElementById('selection-bar');
    if (!bar) return;
    if (!selectMode) { bar.style.display = 'none'; return; }
    bar.style.display = 'block';

    const info = getSelectionInfo();
    const chips = gamesPresent().map(g =>
      `<button class="sel-chip" onclick="Listings.selectAllGame('${g}')">+ all ${GAME_LABELS[g] || g}</button>`
    ).join('');

    let msg, canBulk = false, canVary = false;
    if (info.count === 0)       msg = 'Tap cards to select them.';
    else if (info.count === 1)  msg = '1 selected — pick at least 2.';
    else if (!info.game)        msg = `<span style="color:var(--amber)">${info.count} selected across ${info.games.length} games — listings must be one game.</span>`;
    else {
      canBulk = true;
      canVary = !!info.set;   // variations require a single set
      const setNote = info.set
        ? `, same set ✓`
        : `, <span style="color:var(--amber)">${info.sets.length} sets — variations need one set</span>`;
      msg = `<strong>${info.count}</strong> ${GAME_LABELS[info.game]} cards${setNote}`;
    }

    bar.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <span style="font-size:13px;">${msg}</span>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-left:auto;">
          ${chips}
          <button class="sel-chip" onclick="Listings.clearSelection()">Clear</button>
          <button class="btn-create-bulk" ${canBulk ? '' : 'disabled'} onclick="Listings.promptCreateBulk()">📦 Bulk lot</button>
          <button class="btn-create-vary" ${canVary ? '' : 'disabled'} onclick="Listings.promptCreateVariations()" title="${canVary ? 'One listing, buyer picks the card' : 'Select cards from a single set'}">🔀 Variations listing</button>
          <button class="sel-chip" onclick="Listings.toggleSelectMode()">Done</button>
        </div>
      </div>`;
  }

  function promptCreateVariations() {
    const result = createVariationsFromSelected();
    const s = document.getElementById('save-status');
    if (result.error) {
      if (s) { s.textContent = result.error; s.style.opacity = '1'; setTimeout(()=>s.style.opacity='0', 5000); }
    } else if (s) {
      s.textContent = `Created a ${result.count}-card "${result.set}" variations listing — buyers pick the card.`;
      s.style.opacity = '1'; setTimeout(()=>s.style.opacity='0', 5000);
    }
  }

  function promptCreateBulk() {
    const info = getSelectionInfo();
    if (info.count < 2 || !info.game) return;
    // Create unpriced — the user sets the lot price in the new bulk row's price box.
    const result = createBulkFromSelected(0);
    const s = document.getElementById('save-status');
    if (result.error) {
      if (s) { s.textContent = result.error; s.style.opacity = '1'; setTimeout(()=>s.style.opacity='0', 4000); }
    } else if (s) {
      s.textContent = `Created a ${result.count}-card ${result.game} bulk lot — set its price in the new 📦 row.`;
      s.style.opacity = '1'; setTimeout(()=>s.style.opacity='0', 5000);
    }
  }

  function updateStats() {
    // Flagged-for-review banner
    const flagged = items.filter(l => l.needsRarityCheck).length;
    const fb = document.getElementById('flag-banner');
    if (fb) {
      if (flagged > 0) {
        fb.style.display = 'block';
        fb.innerHTML = `⚠️ <strong>${flagged}</strong> scanned card${flagged !== 1 ? 's' : ''} need a quick finish/rarity check — look for the amber dropdowns and confirm Poké Ball / Master Ball / Holo etc.`;
      } else {
        fb.style.display = 'none';
      }
    }
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

  // Identity of a listing for merge purposes: same game+number+variant+condition+type
  function listingKey(c) {
    const variant = typeof c.variant === 'string' ? c.variant : (c.variant?.label || '');
    return [c.game, (c.number || '').toUpperCase(), variant, c.cond, c.listingType].join('|');
  }

  // Add a scanned card, but if an identical listing already exists, bump its
  // quantity instead of creating a duplicate row. Playsets are never merged
  // (each playset is its own bundle). Returns { merged, qty }.
  function addOrIncrement(card, addQty) {
    const clean = sanitiseCard(card);
    const inc   = addQty || 1;
    if (clean.listingType !== 'playset') {
      const key = listingKey(clean);
      const existing = items.find(it => listingKey(it) === key);
      if (existing) {
        existing.qty = (existing.qty || 1) + inc;
        save();
        render();
        return { merged: true, qty: existing.qty, name: existing.name };
      }
    }
    clean.qty = clean.qty || inc;
    items.push(clean);
    save();
    render();
    return { merged: false, qty: clean.qty, name: clean.name };
  }

  return { add, remove, updatePrice, setMarketCheck, getAll, getItems, getGame, setGame, render, load, save, clearAll, clearAllConfirmed, clearAllCancelled, replaceAll, addAll, addOrIncrement, imageUrl, imageUrlFromFields, toggleSelectMode, isSelectMode, toggleSelect, selectAllGame, clearSelection, promptCreateBulk, promptCreateVariations, setCardVariant };
})();
