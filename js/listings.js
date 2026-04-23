/**
 * listings.js
 * Manages the in-memory listings array and renders the table.
 */

const Listings = (() => {
  let items = [];

  function getPostage() {
    const sel = document.getElementById('f-post').value;
    if (sel === 'custom') {
      return parseFloat(document.getElementById('f-custom-post').value) || 0;
    }
    return parseFloat(sel);
  }

  function add() {
    const number = document.getElementById('f-number').value.trim().toUpperCase();
    const name   = document.getElementById('f-name').value.trim();
    const lang   = document.getElementById('f-lang').value;
    const cond   = document.getElementById('f-cond').value;
    const qty    = parseInt(document.getElementById('f-qty').value) || 1;
    const price  = parseFloat(document.getElementById('f-price').value);
    const post   = getPostage();

    if (!number) {
      alert('Please enter a card number (e.g. OP01-001).');
      document.getElementById('f-number').focus();
      return;
    }
    if (!name) {
      alert('Please enter a card name.');
      document.getElementById('f-name').focus();
      return;
    }
    if (!price || price <= 0) {
      alert('Please enter a valid price.');
      document.getElementById('f-price').focus();
      return;
    }

    items.push({ number, name, lang, cond, qty, price, post });

    // Clear form for next entry
    document.getElementById('f-number').value = '';
    document.getElementById('f-name').value   = '';
    document.getElementById('f-price').value  = '';
    document.getElementById('f-qty').value    = '1';
    document.getElementById('lookup-status').textContent = '';
    document.getElementById('f-number').focus();

    render();
  }

  function remove(index) {
    items.splice(index, 1);
    render();
  }

  function getAll() {
    return items;
  }

  function render() {
    const list   = document.getElementById('listings-list');
    const empty  = document.getElementById('empty-msg');
    const bar    = document.getElementById('action-bar');

    if (items.length === 0) {
      empty.style.display = 'block';
      list.innerHTML = '';
      bar.style.display = 'none';
    } else {
      empty.style.display = 'none';
      bar.style.display = 'block';
      list.innerHTML = items.map((l, i) => `
        <div class="listing-row">
          <span class="mono">${l.number}</span>
          <span title="${l.name}">${l.name}</span>
          <span class="muted">${l.lang === 'Japanese' ? 'JP' : 'EN'}</span>
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
      ? '$' + (totalVal / totalUnits).toFixed(2)
      : '—';
  }

  return { add, remove, getAll, render };
})();
