/**
 * ui.js
 * UI helpers — game toggle, previews, form controls.
 */

const UI = (() => {

  let currentGame = 'onePiece';

  function setGame(game) {
    currentGame = game;
    Listings.setGame(game);

    document.getElementById('op-fields').style.display = game === 'onePiece' ? 'block' : 'none';
    document.getElementById('pk-fields').style.display = game === 'pokemon'  ? 'block' : 'none';

    document.getElementById('btn-op').classList.toggle('active', game === 'onePiece');
    document.getElementById('btn-pk').classList.toggle('active', game === 'pokemon');

    document.getElementById('f-price').value = '';
    document.getElementById('lookup-status').textContent    = '';
    document.getElementById('pk-lookup-status').textContent = '';
    document.getElementById('card-preview').style.display    = 'none';
    document.getElementById('pk-card-preview').style.display = 'none';
  }

  function toggleCustomPost() {
    const wrap = document.getElementById('custom-post-wrap');
    wrap.style.display = document.getElementById('f-post').value === 'custom' ? 'block' : 'none';
  }

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

  function updatePokemonPreview() {
    const number  = document.getElementById('f-pk-number').value.trim();
    const preview = document.getElementById('pk-card-preview');
    const img     = document.getElementById('pk-card-preview-img');
    if (!number) { preview.style.display = 'none'; return; }
    const url = Listings.imageUrlFromFields('pokemon');
    if (!url) { preview.style.display = 'none'; return; }
    img.src     = url;
    img.onload  = () => { preview.style.display = 'block'; };
    img.onerror = () => { preview.style.display = 'none'; };
  }

  function populatePokemonSets() {
    const select = document.getElementById('f-pk-set');
    const sets   = SETS.pokemon;
    let lastEra  = '';
    let html     = '';
    sets.forEach(s => {
      if (s.era !== lastEra) {
        if (lastEra) html += '</optgroup>';
        html += `<optgroup label="${s.era}">`;
        lastEra = s.era;
      }
      html += `<option value="${s.id}">${s.name}</option>`;
    });
    if (lastEra) html += '</optgroup>';
    select.innerHTML = html;
  }

  function init() {
    // Populate Pokémon set dropdown
    populatePokemonSets();

    // OP number auto-uppercase + preview
    document.getElementById('f-op-number').addEventListener('input', function () {
      const pos = this.selectionStart;
      this.value = this.value.toUpperCase();
      this.setSelectionRange(pos, pos);
      updateOPPreview();
    });

    // OP language change updates preview
    document.getElementById('f-op-lang').addEventListener('change', updateOPPreview);

    // Pokémon number + set change triggers preview
    document.getElementById('f-pk-number').addEventListener('input', updatePokemonPreview);
    document.getElementById('f-pk-set').addEventListener('change', updatePokemonPreview);

    // Enter on price adds card
    document.getElementById('f-price').addEventListener('keydown', e => {
      if (e.key === 'Enter') Listings.add();
    });

    // Restore saved API key
    const saved = localStorage.getItem('ebay_app_id');
    if (saved) {
      document.getElementById('api-key-input').value = saved;
      const s = document.getElementById('api-status');
      s.textContent = 'Saved key loaded.';
      s.className   = 'api-status ok';
    }
  }

  window.addEventListener('DOMContentLoaded', init);

  return { setGame, toggleCustomPost, updatePokemonPreview };
})();
