/**
 * csv.js
 * eBay File Exchange — Variation listings grouped by set.
 *
 * Correct variation format per ShipScript/eBay community documentation:
 *
 * PARENT row:
 *   Relationship       = (blank)
 *   RelationshipDetails = "Card=OP15-001 Luffy SR|OP15-002 Zoro SR|..."
 *   StartPrice         = (blank — warning if set)
 *   Quantity           = (blank)
 *
 * CHILD rows:
 *   Relationship        = Variation
 *   RelationshipDetails = "Card=OP15-001 Luffy SR"
 *   StartPrice          = price for this card
 *   Quantity            = qty for this card
 *
 * Reference: http://shipscript.com/ebayhelp/lister_hub/creating_ebay_variations.htm
 */

const CSV = (() => {

  const CATEGORY = { onePiece: '183454', pokemon: '2536' };

  const CONDITION_MAP = {
    'Near Mint':        '4000',
    'Lightly Played':   '4000',
    'Moderately Played':'3000'
  };

  const OP_CDN  = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece';
  const PKM_CDN = 'https://images.pokemontcg.io';

  const HEADERS = [
    'Action(SiteID=Australia|Country=AU|Currency=AUD|Version=1193)',
    'Title', 'Category', 'ConditionID',
    'StartPrice', 'Quantity',
    'Format', 'Duration',
    'Description', 'PicURL',
    'ShippingType', 'ShippingService-1:Option', 'ShippingService-1:Cost',
    'ShippingService-1:FreeShipping',
    'Location', 'DispatchTimeMax', 'ReturnsAcceptedOption',
    'C:Game', 'CD:40001',
    'Relationship', 'RelationshipDetails'
  ];
  // Note: PicURL for variation rows uses format: Card=VariationName=ImageURL

  function esc(v) {
    v = String(v == null ? '' : v);
    if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }

  /* ─── Set helpers ─── */
  function getSetId(card) {
    if (card.game === 'onePiece') return card.number.split('-')[0].toUpperCase();
    return card.setId || 'PKM';
  }

  function getSetName(card) {
    if (card.game === 'onePiece') {
      const n = { OP01:'Romance Dawn',OP02:'Paramount War',OP03:'Pillars of Strength',
        OP04:'Kingdoms of Intrigue',OP05:'Awakening of the New Era',OP06:'Wings of the Captain',
        OP07:'500 Years in the Future',OP08:'Two Legends',OP09:'The Four Emperors',OP10:'Royal Blood',
        OP11:'Memoir of Upheaval',OP12:'The Grandline Chronicles',OP13:'Hero of Justice',
        OP14:'3D2Y',OP15:'Sealed Memories',ST01:'Straw Hat Crew',ST02:'Worst Generation',
        ST03:'The Seven Warlords',ST04:'Animal Kingdom Pirates',ST05:'Worst Generation 2',
        ST06:'Absolute Justice',ST07:'Big Mom Pirates',ST08:'Monkey D. Luffy',ST09:'Yamato',
        ST10:'UTA',ST11:'Uta',ST12:'Zoro & Sanji',ST13:'The Three Captains',ST14:'3D2Y Luffy',
        ST15:'Red-Haired Pirates',ST16:'Marine',ST17:'Dark Forces',ST18:'World Government',ST19:'Final Chapter' };
      return n[card.number.split('-')[0].toUpperCase()] || getSetId(card);
    }
    return card.setName || card.setId;
  }

  /* ─── Variation name (shown in dropdown) ─── */
  function cleanName(name) {
    if (!name) return '';
    // Strip anything in parentheses and trailing whitespace e.g. "Nami (OP14" → "Nami"
    return name.replace(/\s*\(.*$/, '').trim();
  }

  function variationName(card) {
    const name     = cleanName(card.name);
    const hasName  = name && name !== card.number;
    const namePart = hasName ? ` ${name}` : '';
    // Only add variant label for special variants (SEC Gold etc), not standard SR
    const variant  = card.variant?.label && card.variant.label !== 'Standard' && card.variant.label !== 'SR'
      ? ` ${card.variant.label}` : '';
    return `${card.number}${namePart}${variant}`.substring(0, 65);
  }

  /* ─── Titles / Descriptions ─── */
  function buildTitle(setId, setName, game, lang, cond) {
    // Single consolidated listing title
    const raw = game === 'onePiece'
      ? `One Piece TCG SR Singles${lang === 'Japanese' ? ' Japanese' : ''} Cards ${cond}`
      : `Pokemon TCG Singles Cards ${cond}`;
    return raw.length > 80 ? raw.substring(0, 77) + '...' : raw;
  }

  function buildDesc(cards, setId, setName, game) {
    // Sort cards by set then number for the description list
    const sorted = [...cards].sort((a, b) => {
      const sa = getSetId(a), sb = getSetId(b);
      if (sa !== sb) return sa.localeCompare(sb);
      const na = parseInt((a.number.split('-')[1] || a.number).replace(/\D/g, '')) || 0;
      const nb = parseInt((b.number.split('-')[1] || b.number).replace(/\D/g, '')) || 0;
      return na - nb;
    });

    const list = sorted.map(c => {
      const name    = cleanName(c.name);
      const hasName = name && name !== c.number;
      const variant = c.variant?.label && c.variant.label !== 'Standard' ? ` (${c.variant.label})` : '';
      return `• ${c.number}${hasName ? ' ' + name : ''}${variant} — $${c.price.toFixed(2)} AUD`;
    }).join('\n');

    const header = game === 'onePiece'
      ? ['One Piece TCG SR Singles', 'Super Rare (SR) Cards — Near Mint / Raw (Ungraded)']
      : ['Pokemon TCG Singles', 'Cards — Near Mint / Raw (Ungraded)'];

    return [
      ...header, '',
      'Cards available in this listing:', list, '',
      'Each card is shipped securely in a protective sleeve and rigid toploader.',
      'Select the card you want from the variation dropdown above.',
      'Combined postage available — request an invoice before paying if buying multiple.', '',
      'Australian seller based in Sydney, NSW.',
      'Fast dispatch within 3 business days of cleared payment.'
    ].join('\n');
  }

  function getThumbUrl(card) {
    if (card.imageUrl) return card.imageUrl;
    if (card.game === 'onePiece') {
      const set    = card.number.split('-')[0].toUpperCase();
      const suffix = card.variant?.suffix || '';
      return `${OP_CDN}/${set}/${card.number}${suffix}_${card.lang === 'Japanese' ? 'JP' : 'EN'}.webp`;
    }
    return `${PKM_CDN}/${card.setId}/${card.number}_hires.png`;
  }

  /* ─── Grouping / Sorting ─── */
  function groupBySet(items) {
    // Single listing — all cards in one variation listing
    if (items.length === 0) return [];
    return [{ meta: items[0], cards: items }];
  }

  function sortCards(cards) {
    return [...cards].sort((a, b) => {
      // Sort by set first, then by card number within set
      const sa = getSetId(a), sb = getSetId(b);
      if (sa !== sb) return sa.localeCompare(sb);
      const na = parseInt((a.number.split('-')[1] || a.number).replace(/\D/g, '')) || 0;
      const nb = parseInt((b.number.split('-')[1] || b.number).replace(/\D/g, '')) || 0;
      return na - nb;
    });
  }

  function ebayGame(game) {
    return game === 'onePiece' ? 'One Piece Card Game' : 'Pokemon TCG';
  }

  function ebayCardCondition(cond) {
    // Numeric IDs per ShipScript/eBay for category 183454 (CCG) and 2536 (Pokemon)
    // Near mint or better=400010, Lightly played=400015, Moderately played=400016
    const map = {
      'Near Mint':        '400010',
      'Lightly Played':   '400015',
      'Moderately Played':'400016'
    };
    return map[cond] || '400010';
  }

  function getCardImageUrl(card) {
    if (card.game === 'pokemon') {
      if (card.imageUrl) return card.imageUrl;
      return `https://images.pokemontcg.io/${card.setId}/${card.number}_hires.png`;
    }
    // One Piece: Limitless CDN (same URL used in parent PicURL which works)
    const set    = card.number.split('-')[0].toUpperCase();
    const suffix = card.variant?.suffix || '';
    const lang   = card.lang === 'Japanese' ? 'JP' : 'EN';
    return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${set}/${card.number}${suffix}_${lang}.webp`;
  }

  /* ─── Build CSV rows for one group ─── */
  function buildGroupRows(group) {
    const { meta, cards } = group;
    const sorted  = sortCards(cards);
    const setId   = getSetId(meta);
    const setName = getSetName(meta);
    const post    = meta.post || 0;

    // RelationshipDetails for parent = "Card=Name1|Name2|Name3"
    const allVarNames     = sorted.map(variationName);
    // Parent RelationshipDetails: semicolon-separated, no spaces (eBay requirement)
    const parentRelDetails = 'Card=' + allVarNames.join(';');

    const rows = [];

    /* Parent row */
    rows.push([
      'Add',
      buildTitle(setId, setName, meta.game, meta.lang, meta.cond),
      CATEGORY[meta.game] || '183454',
      CONDITION_MAP[meta.cond] || '4000',
      '',           // StartPrice — blank on parent
      '',           // Quantity — blank on parent
      'FixedPriceItem',
      'GTC',
      buildDesc(sorted, setId, setName, meta.game),
      getThumbUrl(sorted[0]),
      'Flat',
      'AU_Regular',
      post === 0 ? '0.00' : post.toFixed(2),
      post === 0 ? '1' : '0',
      'Sydney, NSW',
      '3',
      'ReturnsNotAccepted',
      ebayGame(meta.game),          // C:Game
      ebayCardCondition(meta.cond), // C:Card Condition
      '',               // Relationship — blank on parent
      parentRelDetails  // RelationshipDetails — semicolon list
    ].map(esc).join(','));

    /* Variation child rows — Action must be BLANK on child rows, not 'Add' */
    sorted.forEach((c, i) => {
      const varName = allVarNames[i];
      const imgUrl    = getCardImageUrl(c);
      // eBay variation PicURL format: "VariationValue=ImageURL"
      // This tells eBay which photo to show when buyer selects this variation
      const varPicUrl = `${varName}=${imgUrl}`;

      rows.push([
        '',   // Action — blank for variation rows
        '', '', '', // Title, Category, ConditionID — blank
        c.price.toFixed(2),   // StartPrice
        c.qty,                // Quantity
        '', '', '',           // Format, Duration, Description — blank
        varPicUrl,            // PicURL — "VarName=ImageURL" switches photo per selection
        '', '', '', '',       // Shipping fields — blank
        '', '', '',           // Location, Dispatch, Returns — blank
        '', '',               // C:Game, C:Card Condition — blank on children
        'Variation',          // Relationship
        `Card=${varName}`     // RelationshipDetails
      ].map(esc).join(','));
    });

    return rows;
  }

  /* ─── Download ─── */
  function buildStandaloneLotRow(card) {
    const name    = cleanName(card.name);
    const qtyStr  = card.qty > 1 ? `${card.qty}x ` : '';
    const lang    = card.lang === 'Japanese' ? ' Japanese' : '';
    const raw     = `${qtyStr}${card.number} ${name || card.number}${lang} One Piece TCG ${card.cond}`;
    const title   = raw.length > 80 ? raw.substring(0, 77) + '...' : raw;
    const imgUrl  = getCardImageUrl(card);
    const post    = card.post || 0;

    return [
      'Add',
      title,
      CATEGORY[card.game] || '183454',
      CONDITION_MAP[card.cond] || '4000',
      card.price.toFixed(2),
      card.qty,
      'FixedPriceItem',
      'GTC',
      [
        `${name || card.number} (${card.number})`,
        `One Piece TCG`,
        `Language: ${card.lang}`,
        `Condition: ${card.cond}`,
        `Quantity: ${card.qty}`,
        '',
        'Card is shipped securely in a protective sleeve and rigid toploader.',
        'Australian seller based in Sydney, NSW.',
        'Fast dispatch within 3 business days of cleared payment.'
      ].join('\n'),
      imgUrl,
      'Flat',
      'AU_Regular',
      post === 0 ? '0.00' : post.toFixed(2),
      post === 0 ? '1' : '0',
      'Sydney, NSW',
      '3',
      'ReturnsNotAccepted',
      ebayGame(card.game),
      ebayCardCondition(card.cond),
      '',  // Relationship
      ''   // RelationshipDetails
    ].map(esc).join(',');
  }

  function download() {
    const rawItems = Listings.getAll();
    if (rawItems.length === 0) { alert('Add at least one card before downloading.'); return; }

    const pricedItems   = rawItems.filter(c => c.price && c.price >= 1.00);
    const unpricedCount = rawItems.length - pricedItems.length;

    if (pricedItems.length === 0) {
      alert('No cards have valid prices set. Use Claude AI Price Research or set prices manually.');
      return;
    }

    if (unpricedCount > 0) {
      const ok = confirm(`${unpricedCount} card${unpricedCount !== 1 ? 's are' : ' is'} unpriced and will be skipped.\n\nDownload CSV for the ${pricedItems.length} priced card${pricedItems.length !== 1 ? 's' : ''}?`);
      if (!ok) return;
    }

    // Split into variation listing vs standalone lot listings
    const variationItems = pricedItems.filter(c => c.listingType !== 'lot');
    const lotItems       = pricedItems.filter(c => c.listingType === 'lot');

    const allRows = [HEADERS.join(',')];

    // Variation listing (grouped)
    if (variationItems.length > 0) {
      const groups = groupBySet(variationItems);
      groups.forEach(g => allRows.push(...buildGroupRows(g)));
    }

    // Standalone lot listings (one row each, sorted by set then number)
    if (lotItems.length > 0) {
      const sortedLots = [...lotItems].sort((a, b) => {
        const sa = a.number.split('-')[0], sb = b.number.split('-')[0];
        if (sa !== sb) return sa.localeCompare(sb);
        const na = parseInt(a.number.split('-')[1]) || 0;
        const nb = parseInt(b.number.split('-')[1]) || 0;
        return na - nb;
      });
      sortedLots.forEach(c => allRows.push(buildStandaloneLotRow(c)));
    }

    const csv  = allRows.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `tcg_ebay_${timestamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function timestamp() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('');
  }

  /* ─── Template download ─── */
  // Simple template — just Number and Qty
  // Defaults: Near Mint, English, variation listing, no price (Claude will fetch)
  // Language: leave blank for English, write "Japanese" for JP
  // Qty: leave blank or 1 for single. Write 2/3/4 for lots (becomes standalone lot listing)
  function downloadTemplate() {
    const headers = ['Number', 'Qty', 'Language'];
    const examples = [
      ['OP01-060', '1', ''],
      ['OP15-113', '1', ''],
      ['OP14-031', '1', 'Japanese'],
      ['OP13-029', '3', ''],
      ['EB01-012', '4', ''],
    ];
    const notes = [
      [''],
      ['# HOW TO USE:'],
      ['# Number  — card number e.g. OP01-060'],
      ['# Qty     — quantity. Leave blank or 1 for single card. 2/3/4 = standalone lot listing'],
      ['# Language — leave blank for English, write Japanese for JP cards'],
      ['# Everything else (name, price, condition) is handled automatically by the site'],
    ];
    const rows = [headers, ...examples, ...notes].map(r => r.map(esc).join(',')).join('\r\n');
    triggerDownload(rows, 'tcg_lister_template.csv');
  }

  /* ─── CSV import ─── */
  function importCSV(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text  = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
        if (lines.length < 2) { alert('CSV appears empty or has no data rows.'); return; }

        // Detect headers
        const headerLine = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
        const hasHeaders = headerLine.includes('number');
        const startRow   = hasHeaders ? 1 : 0;

        // Column indices
        const colNum  = hasHeaders ? headerLine.indexOf('number') : 0;
        const colQty  = hasHeaders ? headerLine.indexOf('qty')    : 1;
        const colLang = hasHeaders ? headerLine.indexOf('language'): 2;

        const imported = [];
        let skipped    = 0;

        for (let i = startRow; i < lines.length; i++) {
          const vals   = parseCSVLine(lines[i]);
          if (vals.every(v => !v.trim())) continue;

          const number = (vals[colNum]  || '').trim().toUpperCase();
          const qtyRaw = parseInt(vals[colQty] || '1') || 1;
          const lang   = (vals[colLang] || '').trim().toLowerCase() === 'japanese' ? 'Japanese' : 'English';

          if (!number || !number.includes('-')) { skipped++; continue; }

          // qty > 1 = standalone lot listing, qty = 1 = variation (set listing)
          const listingType = qtyRaw > 1 ? 'lot' : 'variation';

          imported.push({
            game:        'onePiece',
            number,
            name:        number,   // placeholder — will be enriched by card name API
            lang,
            cond:        'Near Mint',
            qty:         qtyRaw,
            price:       0,        // unpriced — Claude will fetch
            post:        0,
            listingType,
            variant:     { suffix: '', label: 'SR' },
            imageUrl:    null
          });
        }

        if (imported.length === 0) {
          alert('No valid cards found. Make sure each row has a card number like OP01-060.');
          return;
        }

        const existing = Listings.getAll();
        if (existing.length > 0) {
          const choice = confirm(
            `You have ${existing.length} existing card${existing.length !== 1 ? 's' : ''}.\n\n` +
            `OK = Add ${imported.length} imported cards to existing list\n` +
            `Cancel = Replace existing list with imported cards`
          );
          if (choice) Listings.addAll(imported);
          else        Listings.replaceAll(imported);
        } else {
          Listings.replaceAll(imported);
        }

        const msg = `Imported ${imported.length} card${imported.length !== 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} skipped — invalid format)` : ''}.\n\nUse "Research prices for all unpriced cards" to fetch prices via Claude.`;
        alert(msg);

      } catch(err) {
        alert('Import failed: ' + err.message);
      }
      input.value = '';
    };
    reader.readAsText(file);
  }

  function parseCSVLine(line) {
    const result = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(cur); cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur);
    return result;
  }

  function triggerDownload(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { download, downloadTemplate, importCSV };
})();
