/**
 * js/scan.js — AI card scanning
 * Upload images → Claude vision identifies card → enrich via game API → add to listings.
 */
window.Scan = (() => {

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
    const strip = document.getElementById('phone-thumbs');
    if (strip) strip.innerHTML = '';
    const tw = document.getElementById('phone-thumbs-wrap');
    if (tw) tw.style.display = 'none';

    const captureUrl = `${location.origin}/capture.html?s=${phoneSession}`;
    const qrImg = document.getElementById('phone-qr');
    if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(captureUrl)}`;
    const codeEl = document.getElementById('phone-code');
    if (codeEl) codeEl.textContent = phoneSession;
    const linkEl = document.getElementById('phone-link');
    if (linkEl) { linkEl.href = captureUrl; linkEl.textContent = captureUrl.replace(/^https?:\/\//, ''); }
    setPhoneStatus('Waiting for phone to connect…', 'off');

    // Poll the relay. 3s keeps it responsive while sparing the free-tier quota.
    phonePollTimer = setInterval(pollPhone, 3000);
    pollPhone();
  }

  let pollCount = 0;

  function stopPhoneSession() {
    if (phonePollTimer) clearInterval(phonePollTimer);
    phonePollTimer = null;
    // Wipe any leftover images from the relay so nothing lingers in Upstash
    if (phoneSession) {
      const s = phoneSession;
      fetch('/api/relay', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ session: s, cleanup: 1 }) }).catch(()=>{});
    }
    phoneSession = null;
  }

  // Clean up the relay if the user closes/reloads the desktop tab mid-session
  window.addEventListener('beforeunload', () => {
    if (phoneSession) {
      const body = JSON.stringify({ session: phoneSession, cleanup: 1 });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/relay', new Blob([body], { type: 'application/json' }));
    }
  });

  function setPhoneStatus(text, cls) {
    const el = document.getElementById('phone-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = cls === 'ok' ? 'var(--green)' : cls === 'busy' ? 'var(--accent)' : 'var(--amber)';
  }

  async function pollPhone() {
    if (!phoneSession || phoneProcessing) return;
    pollCount++;
    // Ask for the connection flag only every 4th poll (~12s) to save commands
    const wantConn = !phoneConnected || (pollCount % 4 === 0);
    try {
      const resp = await fetch(`/api/relay?session=${phoneSession}${wantConn ? '&conn=1' : ''}`);
      const data = await resp.json();
      if (data.configured === false) {
        setPhoneStatus('⚠️ Sync store not set up — phone scanning needs the Upstash env vars (see SYNC_SETUP.md).', 'off');
        stopPhoneSession();
        return;
      }
      if (data.connected === true && !phoneConnected) {
        phoneConnected = true;
        setPhoneStatus('📱 Phone connected — start capturing cards!', 'ok');
      } else if (data.connected === false && !phoneConnected) {
        setPhoneStatus('Waiting for phone to connect…', 'off');
      }

      if (data.images && data.images.length) {
        await processRelayed(data.images);
      }
    } catch(e) {
      setPhoneStatus('Connection issue, retrying…', 'off');
    }
  }

  const recentScans = {};  // number → timestamp, guards against accidental double-fires
  const ACCIDENTAL_MS = 2500;  // same card within this = one physical card captured twice → skip

  // Add a small thumbnail to the live strip as each card comes in from the phone
  function addThumb(imageB64, label, sublabel, state) {
    const strip = document.getElementById('phone-thumbs');
    if (!strip) return;
    const colors = { added:'var(--green)', merged:'#a855f7', review:'var(--amber)', dup:'#60a5fa', fail:'var(--red)' };
    const border = colors[state] || 'var(--border-md)';
    const cell = document.createElement('div');
    cell.style.cssText = 'flex:0 0 auto; width:72px; text-align:center;';
    cell.innerHTML = `
      <div style="position:relative; width:72px; height:100px; border-radius:8px; overflow:hidden; border:2px solid ${border}; background:#000;">
        <img src="data:image/jpeg;base64,${imageB64}" style="width:100%; height:100%; object-fit:cover;" />
        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.7); color:${border}; font-size:10px; padding:2px;">${label}</div>
      </div>
      <div style="font-size:10px; color:var(--text-muted); margin-top:3px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${sublabel}</div>`;
    strip.prepend(cell);
    // Keep the strip light — cap at the last 12 thumbnails
    while (strip.children.length > 12) strip.removeChild(strip.lastChild);
    document.getElementById('phone-thumbs-wrap').style.display = 'block';
  }

  async function processRelayed(images) {
    phoneProcessing = true;
    const autoPrice = document.getElementById('scan-autoprice')?.value === 'yes';
    document.getElementById('scan-options').style.display = 'block';

    for (const img of images) {
      phoneReceived++;
      setPhoneStatus(`📱 Scanning card ${phoneReceived} from phone…`, 'busy');
      try {
        const ident = await identifyCard(img.image, img.mediaType || 'image/jpeg');
        if (ident.scanError) {
          setPhoneStatus(`⚠ Scan hiccup${ident.retryable ? ' — feed that card again' : ''}`, 'off');
          addThumb(img.image, ident.retryable ? '↻ retry card' : '✗ scan error', 'try again', 'fail');
          continue;
        }
        if (ident.cardBack) {
          setPhoneStatus(`Saw a card back — flip it face-up and capture again`, 'off');
          addThumb(img.image, '↩ card back', 'flip it', 'fail');
          continue;
        }
        if (!ident.number || ident.error) {
          setPhoneStatus(`Couldn't read that card — reposition and capture again`, 'off');
          addThumb(img.image, '✗ unreadable', 'try again', 'fail');
          continue;
        }

        // Accidental double-fire guard: SAME card captured a moment ago = one
        // physical card hit twice → skip. A genuine 2nd copy slung later still counts.
        const key = `${ident.game}:${(ident.number || '').toUpperCase()}`;
        const now = Date.now();
        if (recentScans[key] && (now - recentScans[key]) < ACCIDENTAL_MS) {
          setPhoneStatus(`⏭ Ignored an accidental re-capture of ${ident.number}`, 'busy');
          addThumb(img.image, '⏭ re-capture', ident.number, 'dup');
          recentScans[key] = now;
          continue;
        }
        recentScans[key] = now;

        const enriched = await enrichCard(ident);
        if (enriched.scanConfidence !== 'low') {
          const result = Listings.addOrIncrement(enriched);
          if (autoPrice && window.ClaudeAI?.bulkPrice) setTimeout(() => ClaudeAI.bulkPrice(), 400);
          if (result.merged) {
            setPhoneStatus(`＋ Another ${enriched.name || enriched.number} — qty now ${result.qty}`, 'ok');
            addThumb(img.image, `＋ qty ${result.qty}`, `${enriched.number}`, 'merged');
          } else {
            setPhoneStatus(`✓ Added ${enriched.name || enriched.number} (${enriched.game}) — next card!`, 'ok');
            addThumb(img.image, '✓ added', `${enriched.number}`, 'added');
          }
        } else {
          scannedCards.push(enriched);
          renderResults(autoPrice);
          setPhoneStatus(`Added ${enriched.name || enriched.number} to review (low confidence — verify it)`, 'busy');
          addThumb(img.image, '⚠ review', `${enriched.number}`, 'review');
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

        if (ident.scanError) { failed++; statusEl.textContent = `Scan hiccup on ${file.name} — try that one again`; continue; }
        if (ident.cardBack) { failed++; statusEl.textContent = `Skipped a card back (${file.name})`; continue; }
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
        autoAdd.forEach(c => Listings.addOrIncrement(c));
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

  // Infer the game purely from the collector-number format (very reliable).
  function gameFromNumber(num) {
    const n = (num || '').toUpperCase().trim();
    if (!n) return null;
    if (n.includes('/')) return 'pokemon';                      // 025/198
    // Yu-Gi-Oh: SET-LANG### with a language code (EN/JP/KR/AE/SP/IT/DE/FR/PT),
    // hyphen optional and tolerant of OCR noise (e.g. LOCR-JP001, RA04-EN001)
    if (/[- ]?(EN|JP|KR|AE|SP|IT|DE|FR|PT)\d{2,3}\b/i.test(n)) return 'yugioh';
    const prefix = n.split('-')[0];
    if (/^GD\d/.test(prefix)) return 'gundam';                 // GD01-068 (Gundam only)
    // One Piece: OP##- or PRB##- or promo "P-###" are unambiguous.
    if (/^(OP\d|PRB)/.test(prefix)) return 'onePiece';
    if (/^P-/.test(n)) return 'onePiece';
    // ST## and EB## are shared by One Piece AND Gundam — don't force a game here,
    // let the visual scan decide (mobile suits = Gundam, pirates = One Piece).
    return null;
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
    const ident = await resp.json();

    // Soft scan error (rate limit / bad image / non-JSON) — signal caller to skip & flag
    if (ident.scanError) return { scanError: true, retryable: ident.retryable, message: ident.message };

    // Card back / unreadable → signal caller to skip
    if (ident.cardBack) return { cardBack: true };

    // Cross-validate the game against the number format. The number format is
    // far more reliable than the visual guess, so it wins when unambiguous.
    const byNumber = gameFromNumber(ident.number);
    if (byNumber && byNumber !== ident.game) {
      ident.game = byNumber;
      ident.gameCorrected = true;
    }
    return ident;
  }

  /* ── Enrich identified card via the correct game API ── */
  // Map a scan variant hint to a One Piece rarity label only when meaningful
  function pickedFromScan(v) {
    if (!v || v === 'unknown' || v === 'Normal') return null;
    if (v === 'Alt Art') return 'Parallel';
    return null;  // foil hints (Holo/Reverse) don't apply to One Piece rarity
  }

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

    // Flag for a quick finish/rarity check when the type is ambiguous from a scan:
    // - Pokémon foil finishes (Holo / Reverse / Poké Ball / Master Ball) are easily confused
    // - anything the model wasn't confident about
    const foilFinish = ['Holo','Reverse Holo','Poke Ball','Master Ball'].includes(base.variant);
    if ((ident.game === 'pokemon' && (foilFinish || ident.variant === 'unknown')) || ident.confidence === 'low') {
      base.needsRarityCheck = true;
    }

    try {
      if (ident.game === 'onePiece') {
        let found = false;
        const r = await fetch(`/api/carddetails?number=${encodeURIComponent(base.number)}`);
        if (r.ok) {
          const d = await r.json();
          if (d.name && d.name !== base.number) {
            base.name = d.name.replace(/\s*\([A-Z]{1,4}\d{1,2}.*/i, '').trim();
            found = true;
          }
          base.limitlessSetName = d.setName || null;
          base.imageUrl    = d.imageUrl || null;
          base.cardDetails = d;
          // Auto-detected rarity from Limitless; user can override via the dropdown
          const opRarity = pickedFromScan(ident.variant) || d.rarity || '';
          base.variant     = { suffix: '', label: (typeof normaliseRarity === 'function' ? normaliseRarity('onePiece', opRarity) : opRarity) };
        }
        // If the card couldn't be found, the number was probably misread — flag it
        if (!found) base.needsRarityCheck = true;
      } else if (ident.game === 'yugioh') {
        const r = await fetch(`/api/yugioh?number=${encodeURIComponent(base.number)}`);
        if (r.ok) {
          const d = await r.json();
          if (d.name) base.name = d.name;
          base.limitlessSetName = d.setName || null;
          base.imageUrl    = d.imageUrl || null;
          base.cardDetails = d;
          base.lang        = d.lang || 'English';
          base.variant     = { suffix: '', label: (typeof normaliseRarity === 'function' ? normaliseRarity('yugioh', d.rarity || '') : (d.rarity || '')) };
        }
      } else if (ident.game === 'pokemon') {
        // Pokemon: search pokemontcg.io. The API stores numbers WITHOUT leading
        // zeros (e.g. "51", not "051"), so strip them or the lookup returns nothing.
        const rawNum  = base.number.split('/')[0];
        const numOnly = rawNum.replace(/^0+/, '') || rawNum;   // "051" → "51"
        const total   = base.number.split('/')[1];
        const numericNum = parseInt(numOnly, 10);
        const numericTotal = total ? parseInt(total, 10) : null;

        async function pkmnSearch(query) {
          // Use the resilient proxy (retries + optional key) so transient
          // pokemontcg.io 500s don't break scan enrichment.
          const r = await fetch(`/api/pokemon?q=${encodeURIComponent(query)}&pageSize=10`);
          if (!r.ok) return null;
          const data = await r.json();
          return data.data || [];
        }

        // Try number + set total first, then fall back to number alone
        let results = total ? await pkmnSearch(`number:${numOnly} set.printedTotal:${total}`) : null;
        if (!results || !results.length) results = await pkmnSearch(`number:${numOnly}`);
        const c = (results && results[0]) || null;

        if (c) {
          base.name          = c.name;
          base.setId         = c.set.id;
          base.setName       = c.set.name;
          base.printedNumber = `${c.number}/${c.set.printedTotal || c.set.total}`;
          base.rarity        = c.rarity || null;
          base.imageUrl      = c.images?.large || c.images?.small || '';

          // ── Sanity-check the scanned FINISH against the card's identity ──
          // Secret rares (number above the set total) and special-rarity cards
          // (Illustration/Special Illustration/Hyper/Ultra/Full Art) are NEVER
          // Poké Ball / Master Ball pattern cards — those only exist for the
          // normal-numbered cards. Correct an over-eager ball-pattern guess.
          const setTotal = c.set.printedTotal || c.set.total || numericTotal || 999;
          const isSecret = numericNum && setTotal && numericNum > setTotal;  // e.g. 174/131
          if ((base.variant === 'Master Ball' || base.variant === 'Poke Ball') && isSecret) {
            // A card numbered above the set total is a secret rare (full art / SIR /
            // hyper rare) — it cannot be a Poké Ball / Master Ball pattern card.
            base.variant = 'Holo';
          }
          // Any Pokémon ball-pattern guess is worth a human glance (foil patterns
          // are easy to misread), so flag it whether kept or corrected.
          if (['Master Ball','Poke Ball','Holo','Reverse Holo'].includes(base.variant)) {
            base.needsRarityCheck = true;
          }

          // tcgplayer price for the scanned finish
          const prices = c.tcgplayer?.prices || {};
          const v = base.variant;
          let usd = null;
          if (v === 'Holo')              usd = prices.holofoil?.market || prices.holofoil?.mid;
          else if (v === 'Reverse Holo') usd = prices.reverseHolofoil?.market || prices.reverseHolofoil?.mid;
          else                            usd = (prices.normal || prices.holofoil)?.market || (prices.normal || prices.holofoil)?.mid;
          base.tcgUsdPrice = usd || null;
          if (usd) base.price = Math.max(1.00, Math.round(usd * 1.5 * 100) / 100);
        } else {
          // Not found — leave a readable set hint rather than "undefined"
          base.setName = null;
          base.needsRarityCheck = true;
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
    scannedCards.forEach(c => Listings.addOrIncrement(c));
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

  // Re-pull full card details for a manually-corrected number (the "wrong card?" fix).
  async function reidentify(game, number) {
    const num = (number || '').toUpperCase().trim();
    const byNum = gameFromNumber(num);                 // number format wins
    const ident = {
      game: byNum || game,
      number: num,
      name: num,
      variant: 'Normal',
      confidence: 'high'
    };
    return enrichCard(ident);
  }

  return { handleFiles, removeResult, clearResults, confirmAll, setMode, reidentify };
})();
