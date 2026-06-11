/**
 * js/sync.js — cross-device sync via a shared sync code.
 * Push local listings to cloud, pull on another device with the same code.
 */
const Sync = (() => {
  const CODE_KEY = 'tcg_sync_code';
  let syncCode   = localStorage.getItem(CODE_KEY) || '';
  let autoSync   = true;
  let pushTimer  = null;

  function getCode() { return syncCode; }

  function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O/1/I
    let c = '';
    const arr = new Uint8Array(6);
    crypto.getRandomValues(arr);
    for (const b of arr) c += chars[b % chars.length];
    return c;
  }

  function setCode(code) {
    syncCode = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    localStorage.setItem(CODE_KEY, syncCode);
    updatePill();
  }

  function updatePill(state) {
    const pill = document.getElementById('sync-pill');
    if (!pill) return;
    pill.className = 'sync-pill' + (state ? ' ' + state : '');
    const label = document.getElementById('sync-pill-label');
    if (label) {
      if (state === 'syncing') label.textContent = 'Syncing…';
      else if (syncCode)       label.textContent = `Synced: ${syncCode}`;
      else                     label.textContent = 'Set up sync';
    }
  }

  /* ── Push local listings to cloud (debounced) ── */
  function schedulePush() {
    if (!syncCode || !autoSync) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1500);
  }

  async function push() {
    if (!syncCode) return;
    updatePill('syncing');
    try {
      const listings = Listings.getAll();
      const resp = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: syncCode, listings })
      });
      const data = await resp.json();
      if (data.configured === false) { showSyncMsg('Sync not set up on server — see setup notes.'); updatePill(); return; }
      if (!resp.ok) throw new Error(data.error || 'Push failed');
      updatePill('synced');
    } catch(e) {
      showSyncMsg('Sync push failed: ' + e.message);
      updatePill();
    }
  }

  /* ── Pull from cloud, replace local ── */
  async function pull() {
    if (!syncCode) { showSyncMsg('Enter a sync code first.'); return; }
    updatePill('syncing');
    try {
      const resp = await fetch(`/api/sync?code=${encodeURIComponent(syncCode)}`);
      const data = await resp.json();
      if (data.configured === false) { showSyncMsg('Sync not set up on server — see setup notes.'); updatePill(); return; }
      if (!resp.ok) throw new Error(data.error || 'Pull failed');

      if (Array.isArray(data.listings)) {
        Listings.replaceAll(data.listings);
        const when = data.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'now';
        showSyncMsg(`Pulled ${data.listings.length} listing(s), last updated ${when}.`);
      }
      updatePill('synced');
    } catch(e) {
      showSyncMsg('Sync pull failed: ' + e.message);
      updatePill();
    }
  }

  function showSyncMsg(msg) {
    const el = document.getElementById('sync-msg');
    if (el) { el.textContent = msg; el.style.display = 'block'; setTimeout(() => { el.style.display = 'none'; }, 5000); }
  }

  /* ── Modal ── */
  function openModal() {
    document.getElementById('sync-modal').style.display = 'flex';
    document.getElementById('sync-code-input').value = syncCode;
  }
  function closeModal() { document.getElementById('sync-modal').style.display = 'none'; }

  function saveAndClose() {
    const val = document.getElementById('sync-code-input').value.trim();
    setCode(val);
    if (syncCode) push();
    closeModal();
  }

  function createNew() {
    setCode(genCode());
    document.getElementById('sync-code-input').value = syncCode;
    push();
  }

  function init() {
    updatePill(syncCode ? 'synced' : '');
    // Auto-pull on load if code exists
    if (syncCode) pull();
  }

  window.addEventListener('DOMContentLoaded', init);

  return { getCode, setCode, push, pull, schedulePush, openModal, closeModal, saveAndClose, createNew };
})();
