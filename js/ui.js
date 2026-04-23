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

  // Allow pressing Enter in the price field to add the card
  function init() {
    document.getElementById('f-price').addEventListener('keydown', e => {
      if (e.key === 'Enter') Listings.add();
    });

    // Auto-uppercase card number as typed
    document.getElementById('f-number').addEventListener('input', function () {
      const pos = this.selectionStart;
      this.value = this.value.toUpperCase();
      this.setSelectionRange(pos, pos);
    });
  }

  window.addEventListener('DOMContentLoaded', init);

  return { toggleCustomPost };
})();
