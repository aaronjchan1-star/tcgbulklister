/**
 * ui.js
 * Small UI helpers that don't belong in other modules.
 */

const UI = (() => {

  function toggleCustomPost() {
    const sel  = document.getElementById('f-post').value;
    const wrap = document.getElementById('custom-post-wrap');
    wrap.style.display = sel === 'custom' ? 'block' : 'none';
  }

  /**
   * Show a live card image preview as the user types a card number.
   * Updates whenever the number field loses focus or language changes.
   */
  function updatePreview() {
    const number  = document.getElementById('f-number').value.trim().toUpperCase();
    const lang    = document.getElementById('f-lang').value;
    const preview = document.getElementById('card-preview');
    const img     = document.getElementById('card-preview-img');

    if (!number || !number.includes('-')) {
      preview.style.display = 'none';
      return;
    }

    const url = Listings.imageUrl(number, lang);
    img.src = url;
    img.onload  = () => { preview.style.display = 'block'; };
    img.onerror = () => { preview.style.display = 'none'; };
  }

  function init() {
    // Enter in price field adds card
    document.getElementById('f-price').addEventListener('keydown', e => {
      if (e.key === 'Enter') Listings.add();
    });

    // Auto-uppercase card number + trigger preview
    document.getElementById('f-number').addEventListener('input', function () {
      const pos = this.selectionStart;
      this.value = this.value.toUpperCase();
      this.setSelectionRange(pos, pos);
      updatePreview();
    });

    // Update preview when language changes
    document.getElementById('f-lang').addEventListener('change', updatePreview);
  }

  window.addEventListener('DOMContentLoaded', init);

  return { toggleCustomPost, updatePreview };
})();
