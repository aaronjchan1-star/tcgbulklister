/**
 * ui.js
 * UI helpers — game toggle, One Piece variant picker, Pokémon card search + picker.
 */

const UI = (() => {

  const OP_CDN = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece';

  // All known One Piece card variant suffixes in display order
  const OP_VARIANTS = [
    { suffix: '',        label: 'Standard' },
    { suffix: '_SE',     label: 'SE' },
    { suffix: '_SEC',    label: 'SEC' },
    { suffix: '_GOLD',   label: 'SEC Gold' },
    { suffix: '_SILVER', label: 'SEC Silver' },
    { suffix: '_MANGA',  label: 'SEC Manga' },
    { suffix: '_ALT',    label: 'SEC Alt Art' },
    { suffix: '_P',      label: 'Promo' },
  ];

  let currentGame         = 'onePiece';
  let selectedOPVariant   = null;  // { suffix, label, url }
  let selectedPokemonCard = null;

  /* ─── Game toggle ─── */
  function setGame(game) {
    currentGame = game;
    Listings.setGame(game);
    document.getElementById('op-fields').style.display = game === 'onePiece' ? 'block' : 'none';
    document.getElementById('pk-fields').style.display = game === 'pokemon'  ? 'block' : 'none';
    document.getElementById('btn-op').classList.toggle('active', game === 'onePiece');
    document.getElementById('btn-pk').classList.toggle('active', game === 'pokemon');
    document.getElementById('f-price').value = '';
    resetOPPicker();
    resetPokemonPicker();
  }

  function toggleCustomPost() {
    const wrap = document.getElementById('custom-post-wrap');
    wrap.style.display = document.getElementById('f-post').value === 'custom' ? 'block' : 'none';
  }

  /* ──────────────────────────────────────────
     ONE PIECE — variant picker
  ────────────────────────────────────────── */

  function opImageUrl(number, suffix, lang) {
    const set     = number.split('-')[0].toUpperCase();
    const langTag = lang === 'Japanese' ? 'JP' : 'EN';
    return `${OP_CDN}/${set}/${number}${suffix}_${langTag}.webp`;
  }

  function checkImage(url) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload  = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  async function fetchOPCardName(number) {
    // Call Vercel serverless function which proxies Limitless TCG server-side
    try {
      const res = await fetch(`/api/cardname?number=${encodeURIComponent(number)}`, {
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.name) return data.name;
      }
    } catch(e) { /* not available locally or timed out */ }
    return null;
  }

  async function searchOPVariants() {
    const number  = document.getElementById('f-op-number').value.trim().toUpperCase();
    const lang    = document.getElementById('f-op-lang').value;
    const statusEl = document.getElementById('lookup-status');

    if (!number || !number.includes('-')) {
      statusEl.textContent = 'Enter a card number first (e.g. OP05-119).';
      statusEl.className   = 'lookup-status err';
      return;
    }

    resetOPPicker();
    selectedOPVariant = null;
    statusEl.textContent = 'Checking variants...';
    statusEl.className   = 'lookup-status';

    // Probe images immediately, fetch name in background (don't block on it)
    const imagePromise = Promise.all(
      OP_VARIANTS.map(async v => {
        const url   = opImageUrl(number, v.suffix, lang);
        const valid = await checkImage(url);
        return valid ? { ...v, url } : null;
      })
    );

    // Name lookup runs in background — fills field whenever it resolves
    // Fetch full card details (name, type, power, effects) for use in descriptions
    fetch(`/api/carddetails?number=${encodeURIComponent(number)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const nameField = document.getElementById('f-op-name');
        if (data.name && !nameField.value.trim()) {
          nameField.value = data.name.replace(/\s*\([A-Z]{1,4}\d{1,2}.*/i, '').trim();
        }
        window._currentOPSetName   = data.setName || null;
        window._currentCardDetails = data;
        updateLotPreview();
      })
      .catch(() => {});

    const results = await imagePromise;
    const found = results.filter(Boolean);

    if (found.length === 0) {
      statusEl.textContent = `No images found for ${number}. Check the card number.`;
      statusEl.className   = 'lookup-status err';
      return;
    }

    if (found.length === 1) {
      selectOPVariant(found[0]);
      const resolvedName = document.getElementById('f-op-name').value.trim();
      statusEl.textContent = `Found: ${number} ${found[0].label}${resolvedName ? ' — ' + resolvedName : ''} — click Add to list.`;
      statusEl.className   = 'lookup-status ok';
    } else {
      showOPPicker(number, found);
      statusEl.textContent = `${found.length} variants found — click the correct one.`;
      statusEl.className   = 'lookup-status ok';
    }
  }

  function showOPPicker(number, variants) {
    const wrapper = document.getElementById('op-card-picker');
    const grid    = document.getElementById('op-card-grid');

    grid.innerHTML = variants.map((v, i) => `
      <div class="pk-picker-card" id="op-pick-${i}" onclick="UI.selectOPFromPicker(${i})">
        <img src="${v.url}" alt="${v.label}" />
        <div class="pk-card-name">${number}</div>
        <div class="pk-card-set">${v.label}</div>
      </div>
    `).join('');

    wrapper.style.display = 'block';
    wrapper._variants     = variants;
  }

  function selectOPFromPicker(index) {
    const wrapper  = document.getElementById('op-card-picker');
    const variants = wrapper._variants;
    if (!variants || !variants[index]) return;

    wrapper.querySelectorAll('.pk-picker-card').forEach(el => el.classList.remove('selected'));
    document.getElementById(`op-pick-${index}`).classList.add('selected');

    selectOPVariant(variants[index]);

    const number = document.getElementById('f-op-number').value.trim().toUpperCase();
    const statusEl = document.getElementById('lookup-status');
    statusEl.textContent = `Selected: ${number} ${variants[index].label}`;
    statusEl.className   = 'lookup-status ok';
  }

  function selectOPVariant(variant) {
    selectedOPVariant = variant;

    // Store suffix in a hidden field so listings.js can use it
    document.getElementById('f-op-suffix').value = variant.suffix;
    document.getElementById('f-op-variant-label').value = variant.label;

    // Show preview
    const preview = document.getElementById('card-preview');
    const img     = document.getElementById('card-preview-img');
    img.src       = variant.url;
    preview.style.display = 'block';
  }

  function resetOPPicker() {
    const wrapper = document.getElementById('op-card-picker');
    if (wrapper) {
      wrapper.style.display = 'none';
      document.getElementById('op-card-grid').innerHTML = '';
    }
    document.getElementById('card-preview').style.display  = 'none';
    document.getElementById('lookup-status').textContent   = '';
    document.getElementById('lookup-status').className     = 'lookup-status';
    if (document.getElementById('f-op-suffix')) document.getElementById('f-op-suffix').value = '';
    if (document.getElementById('f-op-variant-label')) document.getElementById('f-op-variant-label').value = '';
    selectedOPVariant = null;
  }

  function getSelectedOPVariant() { return selectedOPVariant; }

  /* ──────────────────────────────────────────
     POKÉMON — card search + picker
  ────────────────────────────────────────── */

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

    try {
      const parts        = input.split('/');
      const rawNumber    = parts[0].trim();
      const printedTotal = parts[1]?.trim();

      let query = `number:${rawNumber}`;
      if (printedTotal) query += ` set.printedTotal:${printedTotal}`;

      const url  = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&select=id,name,number,set,images&orderBy=-set.releaseDate&pageSize=20`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      let cards  = data.data || [];

      if (cards.length === 0 && rawNumber.startsWith('0')) {
        const stripped = String(parseInt(rawNumber, 10));
        let q2 = `number:${stripped}`;
        if (printedTotal) q2 += ` set.printedTotal:${printedTotal}`;
        const res2  = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q2)}&select=id,name,number,set,images&orderBy=-set.releaseDate&pageSize=20`);
        const data2 = await res2.json();
        cards = data2.data || [];
      }

      if (cards.length === 0) {
        statusEl.textContent = `No cards found for "${input}".`;
        statusEl.className   = 'lookup-status err';
        return;
      }

      if (cards.length === 1) {
        selectPokemonCard(cards[0]);
        statusEl.textContent = `Found: ${cards[0].name} — ${cards[0].set.name}`;
        statusEl.className   = 'lookup-status ok';
      } else {
        showPokemonPicker(cards);
        statusEl.textContent = `${cards.length} cards found — click the correct one.`;
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

  function showPokemonPicker(cards) {
    const wrapper = document.getElementById('pk-card-picker');
    const grid    = document.getElementById('pk-card-grid');
    grid.innerHTML = cards.map((card, i) => `
      <div class="pk-picker-card" id="pk-pick-${i}" onclick="UI.selectPKFromPicker(${i})">
        <img src="${card.images?.small || ''}" alt="${card.name}" onerror="this.style.opacity='0.2'" />
        <div class="pk-card-name">${card.name}</div>
        <div class="pk-card-set">${card.set.name}</div>
        <div class="pk-card-num">${card.number}/${card.set.printedTotal || card.set.total}</div>
      </div>
    `).join('');
    wrapper.style.display = 'block';
    wrapper._cards        = cards;
  }

  function selectPKFromPicker(index) {
    const wrapper = document.getElementById('pk-card-picker');
    const cards   = wrapper._cards;
    if (!cards || !cards[index]) return;
    wrapper.querySelectorAll('.pk-picker-card').forEach(el => el.classList.remove('selected'));
    document.getElementById(`pk-pick-${index}`).classList.add('selected');
    selectPokemonCard(cards[index]);
    const statusEl = document.getElementById('pk-lookup-status');
    statusEl.textContent = `Selected: ${cards[index].name} — ${cards[index].set.name}`;
    statusEl.className   = 'lookup-status ok';
  }

  function selectPokemonCard(card) {
    selectedPokemonCard = card;
    document.getElementById('f-pk-name').value = card.name;
    const preview = document.getElementById('pk-card-preview');
    const img     = document.getElementById('pk-card-preview-img');
    img.src       = card.images?.small || '';
    preview.style.display = img.src ? 'block' : 'none';
  }

  function resetPokemonPicker() {
    document.getElementById('pk-card-picker').style.display  = 'none';
    document.getElementById('pk-card-grid').innerHTML        = '';
    document.getElementById('pk-card-preview').style.display = 'none';
    document.getElementById('pk-lookup-status').textContent  = '';
    document.getElementById('pk-lookup-status').className    = 'lookup-status';
    document.getElementById('f-pk-name').value               = '';
    selectedPokemonCard = null;
  }

  function getSelectedPokemonCard() { return selectedPokemonCard; }

  /* ─── Init ─── */
  function init() {
    // OP number — search variants on Enter or when field changes
    document.getElementById('f-op-number').addEventListener('input', function() {
      const pos = this.selectionStart;
      this.value = this.value.toUpperCase();
      this.setSelectionRange(pos, pos);
      resetOPPicker(); // reset when number changes
    });
    document.getElementById('f-op-number').addEventListener('keydown', e => {
      if (e.key === 'Enter') searchOPVariants();
    });
    document.getElementById('f-op-lang').addEventListener('change', () => {
      // Re-run search if we already have a number
      const number = document.getElementById('f-op-number').value.trim();
      if (number.includes('-')) searchOPVariants();
    });

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

    Listings.load();
  }

  window.addEventListener('DOMContentLoaded', init);

  let currentListingType = 'variation';

  function setListingType(type) {
    currentListingType = type;
    ['variation','lot-1','lot-2','lot-3','lot-4','playset'].forEach(t => {
      const el = document.getElementById(`type-${t}`);
      if (el) el.classList.toggle('active', type === t);
    });
    const isLot = type.startsWith('lot-') || type === 'playset';
    document.getElementById('lot-label-wrap').style.display = isLot ? 'block' : 'none';
    // Auto-set qty to match lot size
    if (type === 'playset') {
      document.getElementById('f-op-qty').value = 4;
    } else if (isLot) {
      const qty = parseInt(type.split('-')[1]);
      document.getElementById('f-op-qty').value = qty;
    }
    updateLotPreview();
  }

  function getLotQty() {
    if (currentListingType === 'playset') return 4;
    if (!currentListingType.startsWith('lot-')) return 1;
    return parseInt(currentListingType.split('-')[1]) || 1;
  }

  function updateLotPreview() {
    const number   = document.getElementById('f-op-number').value.trim().toUpperCase();
    const name     = document.getElementById('f-op-name').value.trim();
    const rarity   = document.getElementById('f-op-rarity')?.value || 'SR';
    const preview  = document.getElementById('lot-title-preview');
    if (!preview) return;
    const qty      = getLotQty();
    const cleanedName = name.replace(/\s*\(.*$/, '').trim();
    const displayName = (cleanedName || number) || '...';
    const isPlayset = currentListingType === 'playset';
    const qtyPart   = qty > 1 ? `${qty}x ` : '';
    const suffix    = isPlayset ? ' Playset (x4)' : '';
    preview.textContent = `${qtyPart}${number} ${displayName} One Piece TCG${suffix}`;
  }

  function getListingType() { return currentListingType; }

  return {
    setGame, toggleCustomPost, setListingType, getListingType, getLotQty,
    searchOPVariants, selectOPFromPicker, getSelectedOPVariant,
    searchPokemonCard, selectPKFromPicker, getSelectedPokemonCard,
    updatePokemonPreview: () => {}
  };
})();
