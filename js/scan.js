/**
 * js/scan.js — AI card scanning
 * Upload images → Claude vision identifies card → enrich via game API → add to listings.
 */
const Scan = (() => {

  let scannedCards = [];  // holds results pending review

  /* ── File handling ── */
  function init() {
    const dz    = document.getElementById('scan-dropzone');
    const input = document.getElementById('scan-file-input');
    if (!dz) return;

    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = 'var(--accent)'; });
    dz.addEventListener('dragleave', () => { dz.style.borderColor = 'var(--border-md)'; });
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.style.borderColor = 'var(--border-md)';
      if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
    });
  }

  function setMode(mode) {
    ['upload','camera','phone'].forEach(m => {
      const btn = document.getElementById('scan-mode-' + m);
      if (btn) btn.classList.toggle('active', mode === m);
    });
    const dz   = document.getElementById('scan-dropzone');
    const cam  = document.getElementById('scan-camera-mode');
    const ph   = document.getElementById('scan-phone-mode');
    if (dz)  dz.style.display  = mode === 'upload' ? 'block' : 'none';
    if (cam) cam.style.display = mode === 'camera' ? 'block' : 'none';
    if (ph)  ph.style.display  = mode === 'phone'  ? 'block' : 'none';
    if (mode === 'phone') startPhoneSession();
    else stopPhoneSession();
  }

  /* ─────────────── Live phone scanning via QR ─────────────── */
  let phoneSession = null;
  let phonePollTimer = null;
  let phoneConnected = false;
  let phoneProcessing = false;
  let phoneReceived = 0;

  function genSessionCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = ''; const a = new Uint8Array(6); crypto.getRandomValues(a);
    for (const b of a) c += chars[b % chars.length];
    return c;
  }

  function startPhoneSession() {
    if (phoneSession) return;  // already running
    phoneSession = genSessionCode();
    phoneReceived = 0;
    phoneConnected = false;

    const captureUrl = `${location.origin}/capture.html?s=${phoneSession}`;
    const qrImg = document.getElementById('phone-qr');
    if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(captureUrl)}`;
    const codeEl = document.getElementById('phone-code');
    if (codeEl) codeEl.textContent = phoneSession;
    const linkEl = document.getElementById('phone-link');
    if (linkEl) { linkEl.href = captureUrl; linkEl.textContent = captureUrl.replace(/^https?:\/\//, ''); }
    setPhoneStatus('Waiting for phone to connect…', 'off');

    // Poll the relay for images + connection status
    phonePollTimer = setInterval(pollPhone, 2500);
    pollPhone();
  }

  function stopPhoneSession() {
    if (phonePollTimer) clearInterval(phonePollTimer);
    phonePollTimer = null;
    phoneSession = null;
  }

  function setPhoneStatus(text, cls) {
    const el = document.getElementById('phone-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = cls === 'ok' ? 'var(--green)' : cls === 'busy' ? 'var(--accent)' : 'var(--amber)';
  }

  async function pollPhone() {
    if (!phoneSession || phoneProcessing) return;
    try {
      const resp = await fetch(`/api/relay?session=${phoneSession}`);
      const data = await resp.json();
      if (data.configured === false) {
        setPhoneStatus('⚠️ Sync store not set up — phone scanning needs the Upstash env vars (see SYNC_SETUP.md).', 'off');
        stopPhoneSession();
        return;
      }
      if (data.connected && !phoneConnected) {
        phoneConnected = true;
        setPhoneStatus('📱 Phone connected — start capturing cards!', 'ok');
      } else if (!data.connected && !phoneConnected) {
        setPhoneStatus('Waiting for phone to connect…', 'off');
      }

      if (data.images && data.images.length) {
        await processRelayed(data.images);
      }
    } catch(e) {
      setPhoneStatus('Connection issue, retrying…', 'off');
    }
  }

  const recentScans = {};  // number → timestamp, for duplicate suppression
  const DUPLICATE_WINDOW_MS = 6000;

  async function processRelayed(images) {
    phoneProcessing = true;
    const autoPrice = document.getElementById('scan-autoprice')?.value === 'yes';
    document.getElementById('scan-options').style.display = 'block';

    for (const img of images) {
      phoneReceived++;
      setPhoneStatus(`📱 Scanning card ${phoneReceived} from phone…`, 'busy');
      try {
        const ident = await identifyCard(img.image, img.mediaType || 'image/jpeg');
        if (!ident.number || ident.error) {
          setPhoneStatus(`Couldn't read that card — reposition and capture again`, 'off');
          continue;
        }

        // Duplicate suppression: same card number captured seconds ago = skip
        const key = `${ident.game}:${(ident.number || '').toUpperCase()}`;
        const now = Date.now();
        if (recentScans[key] && (now - recentScans[key]) < DUPLICATE_WINDOW_MS) {
          setPhoneStatus(`⏭ Skipped duplicate of ${ident.number} (just scanned)`, 'busy');
          recentScans[key] = now;
          continue;
        }
        recentScans[key] = now;

        const enriched = await enrichCard(ident);
        if (enriched.scanConfidence !== 'low') {
          Listings.addAll([enriched]);
          if (autoPrice && window.ClaudeAI?.bulkPrice) setTimeout(() => ClaudeAI.bulkPrice(), 400);
          setPhoneStatus(`✓ Added ${enriched.name || enriched.number} (${enriched.game}) — next card!`, 'ok');
        } else {
          scannedCards.push(enriched);
          renderResults(autoPrice);
          setPhoneStatus(`Added ${enriched.name || enriched.number} to review (low confidence — verify it)`, 'busy');
        }
      } catch(e) {
        setPhoneStatus(`Scan failed: ${e.message}`, 'off');
      }
    }
    phoneProcessing = false;
  }

  function isRapidMode() {
    const el = document.getElementById('scan-rapid-mode');
    return el ? el.checked : false;
  }

  async function handleFiles(files) {
    const list = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!list.length) return;

    document.getElementById('scan-options').style.display = 'block';
    const statusEl   = document.getElementById('scan-status');
    const progWrap   = document.getElementById('scan-progress-wrap');
    const progFill   = document.getElementById('scan-progress-fill');
    statusEl.style.display = 'block';
    progWrap.style.display = 'block';

    const cond      = document.getElementById('scan-cond').value;
    const autoPrice = document.getElementById('scan-autoprice').value === 'yes';

    scannedCards = [];
    let done = 0, failed = 0;

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      statusEl.textContent = `Scanning ${i + 1}/${list.length}: ${file.name}...`;
      progFill.style.width = `${Math.round(i / list.length * 100)}%`;

      try {
        const { base64, mediaType } = await fileToBase64(file);
        const ident = await identifyCard(base64, mediaType);

        if (!ident.number || ident.error) { failed++; continue; }

        // Enrich with the right game API
        const enriched = await enrichCard(ident);
        scannedCards.push(enriched);
        done++;
        statusEl.textContent = `✓ ${enriched.name || enriched.number} (${enriched.game})`;
      } catch(e) {
        failed++;
        statusEl.textContent = `✗ ${file.name} — ${e.message}`;
      }
    }

    progFill.style.width = '100%';

    // Rapid mode (camera): auto-add high/medium confidence, only show low-conf for review
    if (isRapidMode() && document.getElementById('scan-camera-mode').style.display !== 'none') {
      const autoAdd = scannedCards.filter(c => c.scanConfidence !== 'low');
      const review  = scannedCards.filter(c => c.scanConfidence === 'low');
      if (autoAdd.length) {
        Listings.addAll(autoAdd);
        if (autoPrice && window.ClaudeAI?.bulkPrice) setTimeout(() => ClaudeAI.bulkPrice(), 400);
      }
      scannedCards = review;
      statusEl.innerHTML = `Added <strong>${autoAdd.length}</strong> automatically${review.length ? `, <span style="color:var(--amber)">${review.length} need review</span>` : ''}${failed ? `, ${failed} failed` : ''}.`;
      if (review.length) renderResults(autoPrice);
      else document.getElementById('scan-results').style.display = 'none';
      return;
    }

    statusEl.innerHTML = `Scanned <strong>${done}</strong> card${done !== 1 ? 's' : ''}${failed ? `, <span style="color:var(--amber)">${failed} failed</span>` : ''}. Review below, then add to list.`;
    renderResults(autoPrice);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      // Downscale large images to keep payload small & fast
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1024;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
        };
        img.onerror = () => reject(new Error('Could not load image'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
  }

  async function identifyCard(base64, mediaType) {
    const resp = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, mediaType })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Scan failed ${resp.status}`);
    }
    return resp.json();
  }

  /* ── Enrich identified card via the correct game API ── */
  async function enrichCard(ident) {
    const cond = document.getElementById('scan-cond').value;
    const base = {
      game:        ident.game,
      number:      ident.number.toUpperCase(),
      name:        ident.name || ident.number,
      cond,
      qty:         1,
      price:       0,
      post:        0,
      listingType: 'lot',
      lang:        'English',
      scanConfidence: ident.confidence || 'medium',
      variant:     ident.variant && ident.variant !== 'unknown' ? ident.variant : 'Normal'
    };

    try {
      if (ident.game === 'onePiece') {
        const r = await fetch(`/api/carddetails?number=${encodeURIComponent(base.number)}`);
        if (r.ok) {
          const d = await r.json();
          if (d.name) base.name = d.name.replace(/\s*\([A-Z]{1,4}\d{1,2}.*/i, '').trim();
          base.limitlessSetName = d.setName || null;
          base.imageUrl    = d.imageUrl || null;
          base.cardDetails = d;
          base.variant     = { suffix: '', label: d.rarity || '' };
        }
      } else if (ident.game === 'riftbound') {
        const r = await fetch(`/api/riftbound?number=${encodeURIComponent(base.number)}`);
        if (r.ok) {
          const d = await r.json();
          if (d.name) base.name = d.name;
          base.limitlessSetName = d.setName || null;
          base.imageUrl    = d.imageUrl || null;
          base.cardDetails = d;
          base.variant     = { suffix: '', label: d.rarity || '' };
        }
      } else if (ident.game === 'yugioh') {
        const r = await fetch(`/api/yugioh?number=${encodeURIComponent(base.number)}`);
        if (r.ok) {
          const d = await r.json();
          if (d.name) base.name = d.name;
          base.limitlessSetName = d.setName || null;
          base.imageUrl    = d.imageUrl || null;
          base.cardDetails = d;
          base.lang        = d.lang || 'English';
          base.variant     = { suffix: '', label: d.rarity || '' };
        }
      } else if (ident.game === 'pokemon') {
        // Pokemon: search pokemontcg.io by number
        const numOnly = base.number.split('/')[0];
        const total   = base.number.split('/')[1];
        let q = `number:${numOnly}`;
        if (total) q += ` set.printedTotal:${total}`;
        const r = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&select=id,name,number,set,images,rarity,tcgplayer&orderBy=-set.releaseDate&pageSize=5`);
        if (r.ok) {
          const data = await r.json();
          const c = data.data?.[0];
          if (c) {
            base.name          = c.name;
            base.setId         = c.set.id;
            base.setName       = c.set.name;
            base.printedNumber = `${c.number}/${c.set.printedTotal || c.set.total}`;
            base.rarity        = c.rarity || null;
            base.imageUrl      = c.images?.large || c.images?.small || '';
            // pull tcgplayer price for the scanned variant
            const prices = c.tcgplayer?.prices || {};
            const v = base.variant;
            let usd = null;
            if (v === 'Holo')              usd = prices.holofoil?.market || prices.holofoil?.mid;
            else if (v === 'Reverse Holo') usd = prices.reverseHolofoil?.market || prices.reverseHolofoil?.mid;
            else                            usd = (prices.normal || prices.holofoil)?.market || (prices.normal || prices.holofoil)?.mid;
            base.tcgUsdPrice = usd || null;
            if (usd) base.price = Math.max(1.00, usd * 1.5);
          }
        }
      }
    } catch(e) { /* enrichment optional — keep base */ }

    return base;
  }

  /* ── Render review table ── */
  function renderResults(autoPrice) {
    const wrap = document.getElementById('scan-results');
    if (!scannedCards.length) { wrap.style.display = 'none'; return; }

    const rows = scannedCards.map((c, i) => {
      const conf = c.scanConfidence === 'low'
        ? '<span style="color:var(--amber);">● low</span>'
        : c.scanConfidence === 'medium'
          ? '<span style="color:#aaa;">● med</span>'
          : '<span style="color:var(--green);">● high</span>';
      const gameBadge = { onePiece:'One Piece', pokemon:'Pokémon', riftbound:'Riftbound', yugioh:'Yu-Gi-Oh!' }[c.game] || c.game;
      const variantLabel = typeof c.variant === 'string' ? c.variant : (c.variant?.label || '');
      return `<tr style="border-bottom:1px solid var(--border);">
        <td style="padding:6px;">${c.imageUrl ? `<img src="${c.imageUrl}" style="width:36px; border-radius:4px;" onerror="this.style.opacity=0.2">` : ''}</td>
        <td style="padding:6px; font-size:12px;">${gameBadge}</td>
        <td style="padding:6px; font-family:monospace; font-size:12px;">${c.printedNumber || c.number}</td>
        <td style="padding:6px; font-size:13px;">${c.name}</td>
        <td style="padding:6px; font-size:12px;">${variantLabel || '—'}</td>
        <td style="padding:6px;">${conf}</td>
        <td style="padding:6px;"><button onclick="Scan.removeResult(${i})" style="background:none; border:none; color:#888; cursor:pointer;">✕</button></td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead><tr style="text-align:left; color:var(--text-muted); font-size:11px; text-transform:uppercase;">
            <th style="padding:6px;"></th><th style="padding:6px;">Game</th><th style="padding:6px;">Number</th>
            <th style="padding:6px;">Name</th><th style="padding:6px;">Variant</th><th style="padding:6px;">Scan</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button class="btn-add" style="flex:1;" onclick="Scan.confirmAll(${autoPrice})">✓ Add ${scannedCards.length} card${scannedCards.length !== 1 ? 's' : ''} to list</button>
        <button class="btn-clear" onclick="Scan.clearResults()">Discard</button>
      </div>
      <p style="font-size:11px; color:var(--text-muted); margin-top:8px;">⚠️ Verify low-confidence cards — AI scanning isn't perfect, especially with foils and glare.</p>`;
    wrap.style.display = 'block';
  }

  function removeResult(i) { scannedCards.splice(i, 1); renderResults(); }
  function clearResults() {
    scannedCards = [];
    document.getElementById('scan-results').style.display = 'none';
    document.getElementById('scan-status').style.display = 'none';
    document.getElementById('scan-progress-wrap').style.display = 'none';
    document.getElementById('scan-file-input').value = '';
  }

  async function confirmAll(autoPrice) {
    if (!scannedCards.length) return;
    Listings.addAll(scannedCards);
    const count = scannedCards.length;
    clearResults();

    const s = document.getElementById('save-status');
    if (s) { s.textContent = `Added ${count} scanned card${count !== 1 ? 's' : ''}.`; s.style.opacity = '1'; setTimeout(() => s.style.opacity = '0', 3000); }

    // Auto-price if requested
    if (autoPrice && window.ClaudeAI?.bulkPrice) {
      setTimeout(() => ClaudeAI.bulkPrice(), 500);
    }
  }

  window.addEventListener('DOMContentLoaded', init);

  return { handleFiles, removeResult, clearResults, confirmAll, setMode };
})();
