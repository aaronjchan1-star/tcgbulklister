/**
 * listings.js
 * Manages the in-memory listings array and renders the table.
 *
 * One Piece images: Limitless TCG CDN
 * Pokémon images:   pokemontcg.io CDN
 */

const Listings = (() => {
  const OP_IMG  = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece';
  const PKM_IMG = 'https://images.pokemontcg.io';

  let items = [];
  let currentGame = 'onePiece';

  function setGame(game) { currentGame = game; }

  function getPostage() {
    const sel = document.getElementById('f-post').value;
    if (sel === 'custom') return parseFloat(document.getElementById('f-custom-post').value) || 0;
    return parseFloat(sel);
  }

  function imageUrl(item) {
    if (item.game === 'pokemon') {
      return `${PKM_IMG}/${item.setId}/${item.number}_hires.png`;
    }
    const set     = item.number.split('-')[0].toUpperCase();
    const langTag = item.lang === 'Japanese' ? 'JP' : 'EN';
    return `${OP_IMG}/${set}/${item.number}_${langTag}.webp`;
  }

  function imageUrlFromFields(game) {
    if (game === 'pokemon') {
      const setId  = document.getElementById('f-pk-set').value;
      const number = document.getElementById('f-pk-number').value.trim();
      if (!setId || !number) return null;
      return `${PKM_IMG}/${setId}/${number}_hires.png`;
    }
    const number = document.getElementById('f-op-number').value.trim().toUpperCase();
    const lang   = document.getElementById('f-op-lang').value;
    if (!number || !number.includes('-')) return null;
    const set     = number.split('-')[0];
    const langTag = lang === 'Japanese' ? 'JP' : 'EN';
    return `${OP_IMG}/${set}/${number}_${langTag}.webp`;
  }

  function add() {
    const price = parseFloat(document.getElementById('f-price').value);
    const post  = getPostage();

    if (!price || price <= 0) {
      alert('Please enter a valid price.');
      document.getElementById('f-price').focus();
      return;
    }

    let card;

    if (currentGame === 'onePiece') {
      const number = document.getElementById('f-op-number').value.trim().toUpperCase();
      const name   = document.getElementById('f-op-name').value.trim();
      const lang   = document.getElementById('f-op-lang').value;
      const cond   = document.getElementById('f-op-cond').value;
      const qty    = parseInt(document.getElementById('f-op-qty').value) || 1;
      if (!number) { alert('Please enter a card number.'); return; }
      if (!name)   { alert('Please enter a card name.'); return; }
      card = { game: 'onePiece', number, name, lang, cond, qty, price, post };

    } else {
      const setId   = document.getElementById('f-pk-set').value;
      const setName = document.getElementById('f-pk-set').selectedOptions[0]?.text || setId;
      const number  = document.getElementById('f-pk-number').value.trim();
      const name    = document.getElementById('f-pk-name').value.trim();
      const cond    = document.getElementById('f-pk-cond').value;
      const qty     = parseInt(document.getElementById('f-pk-qty').value) || 1;
      if (!number) { alert('Please enter the card number (e.g. 215).'); return; }
      if (!name)   { alert('Please enter the card name.'); return; }
      card = { game: 'pokemon', setId, setName, number, name, lang: 'English', cond, qty, price, post };
    }

    items.push(card);
    clearForm();
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
      document.getElementById('f-pk-name').value   = '';
      document.getElementById('f-pk-qty').value    = '1';
      document.getElementById('pk-card-preview').style.display = 'none';
      document.getElementById('pk-lookup-status').textContent  = '';
      document.getElementById('f-pk-number').focus();
    }
    document.getElementById('f-price').value = '';
  }

  function remove(index) {
    items.splice(index, 1);
    render();
  }

  function getAll()     { return items; }
  function getGame()    { return currentGame; }

  function gameLabel(item) {
    return item.game === 'pokemon' ? 'Pokémon' : 'One Piece';
  }

  function gameBadgeClass(item) {
    return item.game === 'pokemon' ? 'badge-pk' : 'badge-op';
  }

  function subLabel(item) {
    if (item.game === 'pokemon') return item.setName;
    return item.lang === 'Japanese' ? 'JP' : 'EN';
  }

  function render() {
    const list  = document.getElementById('listings-list');
    const empty = document.getElementById('empty-msg');
    const bar   = document.getElementById('action-bar');

    if (items.length === 0) {
      empty.style.display = 'block';
      list.innerHTML = '';
      bar.style.display = 'none';
    } else {
      empty.style.display = 'none';
      bar.style.display = 'block';
      list.innerHTML = items.map((l, i) => `
        <div class="listing-row">
          <img class="card-thumb" src="${imageUrl(l)}" alt="${l.number}" onerror="this.style.display='none'" />
          <span><span class="badge ${gameBadgeClass(l)}">${gameLabel(l)}</span></span>
          <span class="mono">${l.number}</span>
          <span class="listing-name" title="${l.name}">${l.name}</span>
          <span class="muted" title="${subLabel(l)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${subLabel(l)}</span>
          <span class="muted">${l.cond}</span>
          <span class="muted">${l.qty}</span>
          <span>$${l.price.toFixed(2)}</span>
          <span class="muted">${l.post === 0 ? 'Free' : '$' + l.post.toFixed(2)}</span>
          <button class="remove-btn" onclick="Listings.remove(${i})" title="Remove">&#x2715;</button>
        </div>
      `).join('');
    }
    updateStats();
  }

  function updateStats() {
    const totalUnits = items.reduce((s, l) => s + l.qty, 0);
    const totalVal   = items.reduce((s, l) => s + l.price * l.qty, 0);
    document.getElementById('stat-count').textContent = totalUnits;
    document.getElementById('stat-total').textContent = '$' + totalVal.toFixed(2);
    document.getElementById('stat-avg').textContent   = totalUnits > 0
      ? '$' + (totalVal / totalUnits).toFixed(2) : '—';
  }

  return { add, remove, getAll, getGame, setGame, render, imageUrl, imageUrlFromFields };
})();
