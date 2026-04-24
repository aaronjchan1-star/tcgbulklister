/**
 * listings.js
 * Manages listings — add, remove, render, save/load via localStorage.
 */

const Listings = (() => {
  const OP_IMG      = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece';
  const PKM_IMG     = 'https://images.pokemontcg.io';
  const STORAGE_KEY = 'tcg_listings';

  let items       = [];
  let currentGame = 'onePiece';

  function setGame(game) { currentGame = game; }
  function getGame()     { return currentGame; }

  function getPostage() {
    const sel = document.getElementById('f-post').value;
    if (sel === 'custom') return parseFloat(document.getElementById('f-custom-post').value) || 0;
    return parseFloat(sel);
  }

  function imageUrl(item) {
    // Use stored imageUrl if available (Pokémon from API)
    if (item.imageUrl) return item.imageUrl;
    if (item.game === 'pokemon') {
      return `${PKM_IMG}/${item.setId}/${item.number}_hires.png`;
    }
    const set     = item.number.split('-')[0].toUpperCase();
    const langTag = item.lang === 'Japanese' ? 'JP' : 'EN';
    return `${OP_IMG}/${set}/${item.number}_${langTag}.webp`;
  }

  function imageUrlFromFields(game) {
    if (game === 'pokemon') return null; // Pokémon now uses API search
    const number  = document.getElementById('f-op-number').value.trim().toUpperCase();
    const lang    = document.getElementById('f-op-lang').value;
    if (!number || !number.includes('-')) return null;
    const set     = number.split('-')[0];
    const langTag = lang === 'Japanese' ? 'JP' : 'EN';
    return `${OP_IMG}/${set}/${number}_${langTag}.webp`;
  }

  function add() {
    const price = parseFloat(document.getElementById('f-price').value) || 0;
    const post  = getPostage();
    let card;

    if (currentGame === 'onePiece') {
      const number = document.getElementById('f-op-number').value.trim().toUpperCase();
      const name   = document.getElementById('f-op-name').value.trim();
      const lang   = document.getElementById('f-op-lang').value;
      const cond   = document.getElementById('f-op-cond').value;
      const qty    = parseInt(document.getElementById('f-op-qty').value) || 1;
      if (!number) { alert('Please enter a card number (e.g. OP01-060).'); return; }
      if (!name)   { alert('Please enter a card name.'); return; }
      card = { game: 'onePiece', number, name, lang, cond, qty, price, post };

    } else {
      const selected = UI.getSelectedPokemonCard();
      if (!selected) { alert('Search for a card first, then click the correct image.'); return; }
      const name = document.getElementById('f-pk-name').value.trim() || selected.name;
      const cond = document.getElementById('f-pk-cond').value;
      const qty  = parseInt(document.getElementById('f-pk-qty').value) || 1;
      const printedNum = `${selected.number}/${selected.set.printedTotal || selected.set.total}`;
      card = {
        game:      'pokemon',
        setId:     selected.set.id,
        setName:   selected.set.name,
        number:    selected.number,
        printedNumber: printedNum,
        name,
        imageUrl:  selected.images?.large || selected.images?.small || '',
        lang:      'English',
        cond,
        qty,
        price,
        post
      };
    }

    items.push(card);
    clearForm();
    save();
    render();
  }

  function clearForm() {
    if (currentGame === 'onePiece') {
      document.getElementById('f-op-number').value = '';
      document.getElementById('f-op-name').value   = '';
      document.getElementById('f-op-qty').value    = '1';
      document.getElementById('card-preview').style.display = 'none';
      document.getElementById('lookup-status').textContent  = '';
      document.getElementById('f-op-number').focus();
    } else {
      document.getElementById('f-pk-number').value = '';
      document.getElementById('f-pk-qty').value    = '1';
      document.getElementById('pk-card-picker').style.display = 'none';
      document.getElementById('pk-card-grid').innerHTML        = '';
      document.getElementById('pk-card-preview').style.display = 'none';
      document.getElementById('pk-lookup-status').textContent  = '';
      document.getElementById('f-pk-name').value               = '';
      document.getElementById('f-pk-number').focus();
    }
    document.getElementById('f-price').value = '';
  }

  function remove(index) {
    items.splice(index, 1);
    save();
    render();
  }

  function updatePrice(index, price) {
    items[index].price = price;
    save();
    render();
  }

  function getAll()   { return items; }
  function getItems() { return items; }

  /* ─── Save / Load ─── */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      showSaveStatus('List saved');
    } catch(e) { console.warn('Save failed:', e); }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        items = JSON.parse(raw);
        render();
        if (items.length > 0) showSaveStatus(`Loaded ${items.length} card${items.length !== 1 ? 's' : ''} from last session`);
      }
    } catch(e) { console.warn('Load failed:', e); }
  }

  function clearAll() {
    if (items.length === 0) return;
    if (!confirm(`Clear all ${items.length} listing${items.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    items = [];
    localStorage.removeItem(STORAGE_KEY);
    render();
    showSaveStatus('List cleared');
  }

  function showSaveStatus(msg) {
    const el = document.getElementById('save-status');
    if (!el) return;
    el.textContent  = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 2500);
  }

  /* ─── Render ─── */
  function gameLabel(item)      { return item.game === 'pokemon' ? 'Pokémon' : 'One Piece'; }
  function gameBadgeClass(item) { return item.game === 'pokemon' ? 'badge-pk' : 'badge-op'; }

  function subLabel(item) {
    if (item.game === 'pokemon') return item.setName || item.setId;
    return item.lang === 'Japanese' ? 'JP' : 'EN';
  }

  function displayNumber(item) {
    return item.game === 'pokemon' ? (item.printedNumber || item.number) : item.number;
  }

  function priceCell(item) {
    if (!item.price || item.price === 0) return `<span class="price-missing">—</span>`;
    return `<span>$${item.price.toFixed(2)}</span>`;
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
          <span class="listing-name" title="${l.name}">${l.name}</span>
          <span class="muted" title="${subLabel(l)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${subLabel(l)}</span>
          <span class="muted">${l.cond}</span>
          <span class="muted">${l.qty}</span>
          ${priceCell(l)}
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
    document.getElementById('stat-count').textContent   = totalUnits;
    document.getElementById('stat-total').textContent   = '$' + totalVal.toFixed(2);
    document.getElementById('stat-avg').textContent     = totalUnits > 0 ? '$' + (totalVal / totalUnits).toFixed(2) : '—';
    const u = document.getElementById('stat-unpriced');
    if (u) u.textContent = unpriced;
  }

  return { add, remove, updatePrice, getAll, getItems, getGame, setGame, render, load, save, clearAll, imageUrl, imageUrlFromFields };
})();
