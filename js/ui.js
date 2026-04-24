/**
 * ui.js
 * UI helpers — game toggle, One Piece preview, Pokémon card search + picker.
 */

const UI = (() => {

  let currentGame          = 'onePiece';
  let selectedPokemonCard  = null;  // full card object from pokemontcg.io API

  /* ─── Game toggle ─── */
  function setGame(game) {
    currentGame = game;
    Listings.setGame(game);
    document.getElementById('op-fields').style.display = game === 'onePiece' ? 'block' : 'none';
    document.getElementById('pk-fields').style.display = game === 'pokemon'  ? 'block' : 'none';
    document.getElementById('btn-op').classList.toggle('active', game === 'onePiece');
    document.getElementById('btn-pk').classList.toggle('active', game === 'pokemon');
    document.getElementById('f-price').value = '';
    resetPokemonPicker();
  }

  /* ─── Postage ─── */
  function toggleCustomPost() {
    const wrap = document.getElementById('custom-post-wrap');
    wrap.style.display = document.getElementById('f-post').value === 'custom' ? 'block' : 'none';
  }

  /* ─── One Piece preview ─── */
  function updateOPPreview() {
    const number  = document.getElementById('f-op-number').value.trim().toUpperCase();
    const lang    = document.getElementById('f-op-lang').value;
    const preview = document.getElementById('card-preview');
    const img     = document.getElementById('card-preview-img');
    if (!number || !number.includes('-')) { preview.style.display = 'none'; return; }
    const url = Listings.imageUrlFromFields('onePiece');
    if (!url) { preview.style.display = 'none'; return; }
    img.src     = url;
    img.onload  = () => { preview.style.display = 'block'; };
    img.onerror = () => { preview.style.display = 'none'; };
  }

  /* ─── Pokémon card search ─── */
  async function searchPokemonCard() {
    const input    = document.getElementById('f-pk-number').value.trim();
    const statusEl = document.getElementById('pk-lookup-status');
    const btn      = document.getElementById('pk-search-btn');

    if (!input) {
      statusEl.textContent = 'Enter a card number first (e.g. 025/198).';
      statusEl.className   = 'lookup-status err';
      return;
    }

    resetPokemonPicker();
    selectedPokemonCard = null;
    btn.disabled        = true;
    btn.textContent     = 'Searching...';
    statusEl.textContent = '';
    statusEl.className   = 'lookup-status';

    try {
      // Parse "025/198" → number="025", printedTotal="198"
      const parts        = input.split('/');
      const rawNumber    = parts[0].trim();
      const printedTotal = parts[1]?.trim();

      // Build query — try exact number first, also try without leading zeros
      let query = `number:${rawNumber}`;
      if (printedTotal) query += ` set.printedTotal:${printedTotal}`;

      const url  = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&select=id,name,number,set,images&orderBy=-set.releaseDate&pageSize=20`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      let cards  = data.data || [];

      // If no results and number had leading zeros, retry without them
      if (cards.length === 0 && rawNumber.startsWith('0')) {
        const stripped = String(parseInt(rawNumber, 10));
        let q2 = `number:${stripped}`;
        if (printedTotal) q2 += ` set.printedTotal:${printedTotal}`;
        const res2  = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q2)}&select=id,name,number,set,images&orderBy=-set.releaseDate&pageSize=20`);
        const data2 = await res2.json();
        cards = data2.data || [];
      }

      if (cards.length === 0) {
        statusEl.textContent = `No cards found for "${input}". Check the number and try again.`;
        statusEl.className   = 'lookup-status err';
        return;
      }

      if (cards.length === 1) {
        selectCard(cards[0]);
        statusEl.textContent = `Found: ${cards[0].name} — ${cards[0].set.name}`;
        statusEl.className   = 'lookup-status ok';
      } else {
        showCardPicker(cards);
        statusEl.textContent = `${cards.length} cards found — click the correct one below.`;
        statusEl.className   = 'lookup-status ok';
      }

    } catch(err) {
      statusEl.textContent = `Search failed: ${err.message}`;
      statusEl.className   = 'lookup-status err';
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Search';
    }
  }

  function showCardPicker(cards) {
    const wrapper = document.getElementById('pk-card-picker');
    const grid    = document.getElementById('pk-card-grid');
    grid.innerHTML = cards.map((card, i) => `
      <div class="pk-picker-card" id="pk-pick-${i}" onclick="UI.selectCardFromPicker(${i})">
        <img src="${card.images?.small || ''}" alt="${card.name}" onerror="this.style.opacity='0.2'" />
        <div class="pk-card-name">${card.name}</div>
        <div class="pk-card-set">${card.set.name}</div>
        <div class="pk-card-num">${card.number}/${card.set.printedTotal || card.set.total}</div>
      </div>
    `).join('');
    wrapper.style.display  = 'block';
    wrapper._cards         = cards;
  }

  function selectCardFromPicker(index) {
    const wrapper = document.getElementById('pk-card-picker');
    const cards   = wrapper._cards;
    if (!cards || !cards[index]) return;

    // Highlight selected
    wrapper.querySelectorAll('.pk-picker-card').forEach(el => el.classList.remove('selected'));
    document.getElementById(`pk-pick-${index}`).classList.add('selected');

    selectCard(cards[index]);

    const statusEl = document.getElementById('pk-lookup-status');
    statusEl.textContent = `Selected: ${cards[index].name} — ${cards[index].set.name}`;
    statusEl.className   = 'lookup-status ok';
  }

  function selectCard(card) {
    selectedPokemonCard = card;

    // Auto-fill card name
    document.getElementById('f-pk-name').value = card.name;

    // Show preview
    const preview = document.getElementById('pk-card-preview');
    const img     = document.getElementById('pk-card-preview-img');
    img.src       = card.images?.small || '';
    preview.style.display = img.src ? 'block' : 'none';
  }

  function resetPokemonPicker() {
    document.getElementById('pk-card-picker').style.display = 'none';
    document.getElementById('pk-card-grid').innerHTML        = '';
    document.getElementById('pk-card-preview').style.display = 'none';
    document.getElementById('pk-lookup-status').textContent  = '';
    document.getElementById('pk-lookup-status').className    = 'lookup-status';
    document.getElementById('f-pk-name').value               = '';
    selectedPokemonCard = null;
  }

  function getSelectedPokemonCard() { return selectedPokemonCard; }

  /* ─── Populate Pokémon sets (not used for search but kept for CSV fallback) ─── */
  function populatePokemonSets() {
    // No longer a dropdown — sets now come from API search results
  }

  /* ─── Init ─── */
  function init() {
    // OP number auto-uppercase + preview
    document.getElementById('f-op-number').addEventListener('input', function() {
      const pos = this.selectionStart;
      this.value = this.value.toUpperCase();
      this.setSelectionRange(pos, pos);
      updateOPPreview();
    });
    document.getElementById('f-op-lang').addEventListener('change', updateOPPreview);

    // Pokémon number — search on Enter
    document.getElementById('f-pk-number').addEventListener('keydown', e => {
      if (e.key === 'Enter') searchPokemonCard();
    });

    // Price — add on Enter
    document.getElementById('f-price').addEventListener('keydown', e => {
      if (e.key === 'Enter') Listings.add();
    });

    // Restore API key
    const saved = localStorage.getItem('ebay_app_id');
    if (saved) {
      document.getElementById('api-key-input').value = saved;
      const s = document.getElementById('api-status');
      s.textContent = 'Saved key loaded.';
      s.className   = 'api-status ok';
    }

    // Load saved listings
    Listings.load();
  }

  window.addEventListener('DOMContentLoaded', init);

  return { setGame, toggleCustomPost, searchPokemonCard, selectCardFromPicker, getSelectedPokemonCard, updatePokemonPreview: () => {} };
})();
