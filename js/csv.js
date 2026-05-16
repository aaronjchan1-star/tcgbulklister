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

  const CATEGORY = { onePiece: '183454', pokemon: '2536', riftbound: '183050', yugioh: '183454' }; // 183050 = Other CCG Individual Cards

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
      // Riftbound sets
      const rb = { OGN:'Origins', OGS:'Origins Overnumbered', SFD:'Spiritforged', SFS:'Spiritforged Overnumbered', UNL:'Unleashed', ULS:'Unleashed Overnumbered' };
      if (rb[setCode]) return rb[setCode];

      const n = { EB01:'Memorial Collection',EB02:'Anime 25th Collection',EB03:'Heroines Edition',EB04:"Adventure on Kami's Island",OP01:'Romance Dawn',OP02:'Paramount War',OP03:'Pillars of Strength',OP04:'Kingdoms of Intrigue',OP05:'Awakening of the New Era',OP06:'Wings of the Captain',OP07:'500 Years in the Future',OP08:'Two Legends',OP09:'The Four Emperors',OP10:'Royal Blood',OP11:'A Fist of Divine Speed',OP12:'Legacy of the Master',OP13:'Carrying on his Will',OP14:"The Azure Sea's Seven",OP15:"Adventure on Kami's Island",PRB01:'The Best Vol.1',PRB02:'The Best Vol.2',ST01:'Straw Hat Crew',ST02:'Worst Generation',ST03:'The Seven Warlords',ST04:'Animal Kingdom Pirates',ST05:'Worst Generation 2',ST06:'Absolute Justice',ST07:'Big Mom Pirates',ST08:'Monkey D. Luffy',ST09:'Yamato',ST10:'UTA',ST11:'Uta',ST12:'Zoro & Sanji',ST13:'The Three Captains',ST14:'3D2Y Luffy',ST15:'Red-Haired Pirates',ST16:'Marine',ST17:'Dark Forces',ST18:'World Government',ST19:'Final Chapter' };
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
  function buildTitle(setId, setName, game, lang, cond, batchNum, totalBatches) {
    const batchSuffix = totalBatches > 1 ? ` (Pt ${batchNum})` : '';
    const raw = game === 'onePiece'
      ? `One Piece TCG${lang === 'Japanese' ? ' Japanese' : ''} Singles Cards ${cond}${batchSuffix}`
      : `Pokemon TCG Singles Cards ${cond}${batchSuffix}`;
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
      ? ['One Piece TCG Singles', 'Near Mint / Raw (Ungraded)']
      : ['Pokemon TCG Singles', 'Cards — Near Mint / Raw (Ungraded)'];

    return [
      ...header, '',
      'Cards available in this listing:', list, '',
      'Each card is shipped securely in a protective sleeve and rigid toploader.',
      'Select the card you want from the variation dropdown above.',
      'Combined postage available — request an invoice before paying if buying multiple.', '',
      'Dispatched within 3 business days of cleared payment.'
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

  const MAX_VARIATIONS = 60; // eBay hard limit per variation listing

  /* ─── Grouping / Sorting ─── */
  function groupBySet(items) {
    if (items.length === 0) return [];
    // Sort all cards first
    const sorted = sortAllCards(items);
    // Split into batches of MAX_VARIATIONS
    const groups = [];
    const totalBatches = Math.ceil(sorted.length / MAX_VARIATIONS);
    for (let i = 0; i < sorted.length; i += MAX_VARIATIONS) {
      const batch   = sorted.slice(i, i + MAX_VARIATIONS);
      const batchNum = Math.floor(i / MAX_VARIATIONS) + 1;
      const meta = { ...batch[0], _batchNum: batchNum, _totalBatches: totalBatches };
      groups.push({ meta, cards: batch });
    }
    return groups;
  }

  function sortAllCards(items) {
    return [...items].sort((a, b) => {
      const sa = getSetId(a), sb = getSetId(b);
      if (sa !== sb) return sa.localeCompare(sb);
      const na = parseInt((a.number.split('-')[1] || a.number).replace(/[^0-9]/g, '')) || 0;
      const nb = parseInt((b.number.split('-')[1] || b.number).replace(/[^0-9]/g, '')) || 0;
      return na - nb;
    });
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
      buildTitle(setId, setName, meta.game, meta.lang, meta.cond, meta._batchNum || 1, meta._totalBatches || 1),
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
      rows.push([
        '',   // Action — blank for variation rows
        '', '', '', // Title, Category, ConditionID — blank
        c.price.toFixed(2),   // StartPrice
        c.qty,                // Quantity
        '', '', '', '',       // Format, Duration, Description, PicURL — blank
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
  function buildLotDesc(card, name, setName) {
    if (card.customDesc && card.customDesc.trim()) return card.customDesc.trim();

    const d = card.cardDetails;
    // For playset: always 4 cards. For others: use actual qty.
    // Determine display qty for description
    // For playset: always say 4 cards. For lot with qty>1: show qty. For single: always 1.
    const effectiveQty = card.listingType === 'playset' ? 4 : (card.qty || 1);
    const qtyDisplay   = card.listingType === 'playset'
      ? 'Competitive Playset (4 cards)'
      : effectiveQty > 1 ? `${effectiveQty}` : '1';

    const parts = [];

    // Header — name + number
    parts.push(`<h2>${name || card.number} &nbsp;<small>${card.number}</small></h2>`);

    // Set name
    if (setName) parts.push(`<p><strong>One Piece TCG</strong> · ${setName}</p>`);

    // Card type line: "Character • Purple • 10 Cost" — clean newlines
    if (d?.typeLine) {
      const tl = d.typeLine.replace(/\n/g, ' · ').replace(/\s*·\s*/g, ' · ').replace(/\s*•\s*/g, ' · ').trim();
      parts.push(`<p>${tl}</p>`);
    }

    // Power line: "12000 Power • Strike"
    if (d?.powerLine) {
      const pl = d.powerLine.replace(/\n/g, ' ').replace(/\s*•\s*/g, ' · ').trim();
      parts.push(`<p><strong>${pl}</strong></p>`);
    }

    parts.push('<hr>');

    // Effect text
    if (d?.effects?.length) {
      d.effects.forEach(e => {
        // Convert line breaks within effect to <br>
        const formatted = e.replace(/\n/g, '<br>');
        parts.push(`<p>${formatted}</p>`);
      });
      parts.push('<hr>');
    }

    // Traits
    if (d?.traits) parts.push(`<p><em>${d.traits}</em></p>`);

    // Listing details
    parts.push('<hr>');
    // Only show Quantity for playsets — singles and lots don't need it
    if (card.listingType === 'playset') {
      parts.push(`<p><b>Condition:</b> ${card.cond} &nbsp;|&nbsp; <b>Language:</b> ${card.lang} &nbsp;|&nbsp; <b>Quantity:</b> ${qtyDisplay}</p>`);
    } else {
      parts.push(`<p><b>Condition:</b> ${card.cond} &nbsp;|&nbsp; <b>Language:</b> ${card.lang}</p>`);
    }
    parts.push('<hr>');
    parts.push('<h3>Condition &amp; Grading</h3>');
    parts.push('<p>Cards are assessed under good lighting and considered Near Mint — no major scratches, dents or creases visible to the naked eye. Minor factory print imperfections may be present and are not considered damage.</p>');
    parts.push('<p><b>Please note:</b> Condition is assessed subjectively. We do not accept returns solely on the basis of grading disagreement. If a guaranteed grade is required, we recommend professional grading after purchase.</p>');
    parts.push('<hr>');
    parts.push('<h3>Shipping</h3>');
    parts.push('<p>Shipped in a <b>protective sleeve inside a rigid toploader</b>, securely wrapped. Dispatched within <b>3 business days</b> of cleared payment.</p>');
    if (card.qty > 1 || card.listingType === 'playset') {
      parts.push('<p>Combined postage available — request a total before paying if purchasing multiple items.</p>');
    }

    return parts.join('');
  }

  function buildStandaloneLotRow(card) {
    const name    = cleanName(card.name);
    const setName   = getSetName(card);
    const rarity    = card.variant?.label && card.variant.label !== 'Standard' ? card.variant.label : '';
    const isPlayset = card.listingType === 'playset';
    const lang      = card.lang === 'Japanese' ? ' Japanese' : '';
    let raw;

    if (card.game === 'riftbound') {
      const rbSuffix = isPlayset ? ' Playset' : '';
      raw = `${name} ${card.number} ${setName}${rbSuffix}`;
    } else if (card.game === 'yugioh') {
      // Yu-Gi-Oh: "Dark Magician LOCR-JP001 Legacy of Chaos Reprint 1st Edition"
      raw = `${name} ${card.number} ${setName}${isPlayset ? ' Playset' : ''}`;
    } else if (isPlayset) {
      raw = `${name} ${card.number}${lang} ${setName} Playset`;
    } else {
      raw = `${name} ${card.number}${lang} ${setName}`;
    }
    const title   = raw.length > 80 ? raw.substring(0, 77) + '...' : raw;
    const imgUrl  = getCardImageUrl(card);
    const post    = card.post || 0;

    return [
      'Add',
      title,
      CATEGORY[card.game] || '183454',
      CONDITION_MAP[card.cond] || '4000',
      Math.max(1.00, card.price || 0).toFixed(2),  // eBay AU minimum is $1.00
      card.listingType === 'playset' ? 1 : card.qty,
      'FixedPriceItem',
      'GTC',
      buildLotDesc(card, name, setName),
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
    if (rawItems.length === 0) {
      const s = document.getElementById('save-status');
      if (s) { s.textContent = 'Add at least one card first.'; s.style.opacity='1'; setTimeout(()=>s.style.opacity='0',3000); }
      return;
    }

    // All cards = individual listings. Normalise legacy 'variation' type to 'lot'.
    const normItems = rawItems.map(c => ({
      ...c,
      listingType: (!c.listingType || c.listingType === 'variation') ? 'lot' : c.listingType
    }));

    const allRows = [HEADERS.join(',')];
    [...normItems].sort((a, b) => {
      const sa = a.number.split('-')[0], sb = b.number.split('-')[0];
      if (sa !== sb) return sa.localeCompare(sb);
      return (parseInt(a.number.split('-')[1]) || 0) - (parseInt(b.number.split('-')[1]) || 0);
    }).forEach(c => allRows.push(buildStandaloneLotRow(c)));

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
    const headers = ['Number', 'Qty', 'Language', 'Listing Type'];
    const examples = [
      ['OP01-060', '1', '', 'set'],
      ['OP15-113', '3', '', 'set'],
      ['OP14-031', '1', 'Japanese', 'set'],
      ['OP13-029', '2', '', 'lot'],
      ['EB01-012', '1', '', 'playset'],
      ['EB04-002', '2', '', 'playset'],
    ];
    // Notes go in column F (index 5) so they don't interfere with data columns A-D
    const notes = [
      ['', '', '', '', '', '=== TCG BULK LISTER — IMPORT TEMPLATE ==='],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', 'COLUMNS:'],
      ['', '', '', '', '', '  Number       — Card number e.g. OP01-060, EB04-002'],
      ['', '', '', '', '', '  Price (AUD)  — Leave blank for Claude AI auto-pricing'],
      ['', '', '', '', '', '  Description  — Leave blank to auto-generate from Limitless TCG'],
      ['', '', '', '', '', '               Or type a custom description for the eBay listing'],
      ['', '', '', '', '', '               Enter a price (e.g. 5.00) to set it manually'],
      ['', '', '', '', '', '  Description  — Leave blank to auto-generate from Limitless TCG'],
      ['', '', '', '', '', '               Or type a custom description for the eBay listing'],
      ['', '', '', '', '', '               Enter a price (e.g. 5.00) to set it manually'],
      ['', '', '', '', '', '  Qty          — See Listing Type below for meaning'],
      ['', '', '', '', '', '  Language     — Leave blank for English. Write: Japanese'],
      ['', '', '', '', '', '  Listing Type — set / lot / playset (see below)'],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', 'LISTING TYPES:'],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', '  set'],
      ['', '', '', '', '', '    For SR, SE, SEC cards only.'],
      ['', '', '', '', '', '    Adds the card to a single set variation listing on eBay.'],
      ['', '', '', '', '', '    Qty = how many copies of the card you have.'],
      ['', '', '', '', '', '    e.g. Number=OP15-113, Qty=3, Type=set'],
      ['', '', '', '', '', '         → 1 listing with qty 3 in the OP15 set listing'],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', '  lot'],
      ['', '', '', '', '', '    For R, UC, C cards sold as a bundle.'],
      ['', '', '', '', '', '    Creates a standalone listing with qty prefix in title.'],
      ['', '', '', '', '', '    Qty = number of cards in the listing.'],
      ['', '', '', '', '', '    e.g. Number=OP14-031, Qty=2, Type=lot'],
      ['', '', '', '', '', '         → 1 listing titled "2x Nami OP14-031 3D2Y"'],
      ['', '', '', '', '', '    e.g. Number=OP14-031, Qty=1, Type=lot'],
      ['', '', '', '', '', '         → 1 listing titled "Nami OP14-031 3D2Y"'],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', '  playset'],
      ['', '', '', '', '', '    For R, UC, C cards sold as a competitive playset (4x).'],
      ['', '', '', '', '', '    Each listing = 4 copies of the card.'],
      ['', '', '', '', '', '    Qty = how many SEPARATE PLAYSET LISTINGS you want.'],
      ['', '', '', '', '', '    e.g. Number=EB04-002, Qty=1, Type=playset'],
      ['', '', '', '', '', '         → 1 listing titled "Jewelry Bonney EB04-002 ... Playset"'],
      ['', '', '', '', '', '           (listing qty = 4 cards)'],
      ['', '', '', '', '', '    e.g. Number=EB04-002, Qty=2, Type=playset'],
      ['', '', '', '', '', '         → 2 separate listings, each with 4 cards'],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', 'NOTES:'],
      ['', '', '', '', '', '  - Card name, set name, rarity and image are fetched automatically'],
      ['', '', '', '', '', '  - Prices are fetched via Claude AI after import'],
      ['', '', '', '', '', '  - Condition defaults to Near Mint'],
      ['', '', '', '', '', '  - Postage defaults to Free'],
    ];
    // Merge examples and notes side by side on the same rows
    const dataRows = examples.map((ex, i) => {
      const note = notes[i] || [];
      return [...ex, '', note[5] || ''];
    });
    // Any remaining note rows
    const extraNotes = notes.slice(examples.length).map(n => ['', '', '', '', '', n[5] || '']);
    const rows = [
      [...headers, '', 'Notes'],
      ...dataRows,
      ...extraNotes
    ].map(r => r.map(esc).join(',')).join('\r\n');
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
        if (lines.length < 2) {
        const s = document.getElementById('save-status');
        if (s) { s.textContent = 'CSV appears empty.'; s.style.opacity='1'; setTimeout(()=>s.style.opacity='0',3000); }
        return;
      }

        // Detect headers
        const headerLine = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
        const hasHeaders = headerLine.includes('number');
        const startRow   = hasHeaders ? 1 : 0;

        // Column indices
        const colNum   = hasHeaders ? headerLine.indexOf('number')      : 0;
        const colQty   = hasHeaders ? headerLine.indexOf('qty')         : 1;
        const colLang  = hasHeaders ? headerLine.indexOf('language')    : 2;
        const colLtype = hasHeaders ? headerLine.indexOf('listingtype') : 3;
        const colPrice = hasHeaders ? headerLine.indexOf('priceaud')    : 4;
        const colDesc  = hasHeaders ? (headerLine.indexOf('description') >= 0 ? headerLine.indexOf('description') : -1) : 5;

        const imported = [];
        let skipped    = 0;

        for (let i = startRow; i < lines.length; i++) {
          const vals   = parseCSVLine(lines[i]);
          if (vals.every(v => !v.trim())) continue;

          const number   = (vals[colNum]  || '').trim().toUpperCase();
          const qtyRaw   = parseInt(vals[colQty] || '1') || 1;
          const lang     = (vals[colLang] || '').trim().toLowerCase() === 'japanese' ? 'Japanese' : 'English';
          const ltypeRaw = colLtype >= 0 ? (vals[colLtype] || '').trim().toLowerCase() : '';
          // playset = standalone lot of 4x copies
          const priceRaw   = colPrice >= 0 ? parseFloat(vals[colPrice] || '0') || 0 : 0;
          const isPlayset    = ltypeRaw === 'playset';
          const isLot        = ltypeRaw === 'lot';
          const listingType  = isPlayset ? 'playset' : 'lot';  // all non-playset = lot (individual listing)
          // For playset: qty in CSV = number of playset listings
          // Each playset listing = 4 cards
          // qty=1 → one listing of 4; qty=2 → two listings of 4 each
          const numPlaysets  = isPlayset ? Math.max(1, qtyRaw) : 1;
          const finalQty     = isPlayset ? 4 : qtyRaw;

          if (!number || !number.includes('-')) { skipped++; continue; }

          const cardBase = {
            game:        'onePiece',
            number,
            name:        number,   // placeholder — enriched by Limitless after import
            lang,
            cond:        'Near Mint',
            qty:         finalQty,
            price:       priceRaw, // use CSV price if set, else 0 = Claude will fetch
            post:        0,
            listingType,
            variant:     { suffix: '', label: '' },  // filled by Limitless enrichment
            imageUrl:    null,
            customDesc:  colDesc >= 0 && vals[colDesc] && vals[colDesc].trim() ? vals[colDesc].trim() : null
          };

          // For playsets, create one listing entry per playset
          const copies = isPlayset ? numPlaysets : 1;
          for (let p = 0; p < copies; p++) {
            imported.push({ ...cardBase });
          }
        }

        if (imported.length === 0) {
          const s = document.getElementById('save-status');
          if (s) { s.textContent = 'No valid cards found — check format.'; s.style.opacity='1'; setTimeout(()=>s.style.opacity='0',4000); }
          return;
        }

        const existing = Listings.getAll();
        // Always replace — simpler and avoids confirm() which can be blocked
        Listings.replaceAll(imported);

        const statusEl = document.getElementById('save-status');
        if (statusEl) {
          statusEl.textContent = `Imported ${imported.length} card${imported.length !== 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} skipped)` : ''}. Looking up details...`;
          statusEl.style.opacity = '1';
        }

        // Enrich cards with real names, rarities and images from Limitless
        enrichFromLimitless(Listings.getAll());

      } catch(err) {
        const s2 = document.getElementById('save-status');
        if (s2) { s2.textContent = 'Import failed: ' + err.message; s2.style.opacity='1'; setTimeout(()=>s2.style.opacity='0',5000); }
      }
      input.value = '';
    };
    reader.readAsText(file);
  }

  /* ─── Bulk enrich imported cards with Limitless data ─── */
  async function enrichFromLimitless(importedItems) {
    const statusEl = document.getElementById('save-status');
    let enriched = 0;
    // Work directly on the live items array via Listings methods
    const allItems = Listings.getItems();
    // Find the newly imported items (they'll be at the end with name === number)
    const startIdx = allItems.length - importedItems.length;

    for (let i = 0; i < importedItems.length; i++) {
      const card = allItems[startIdx + i];
      if (!card || card.game !== 'onePiece') continue;

      if (statusEl) {
        statusEl.textContent = `Looking up ${i + 1}/${importedItems.length}: ${card.number}...`;
        statusEl.style.opacity = '1';
      }

      try {
        const langParam = card.lang === 'Japanese' ? 'JP' : 'EN';

        // Try carddetails first for full info
        let name = null, rarity = null, setName = null, imageUrl = null, cardDetails = null;

        try {
          const r1 = await fetch(`/api/carddetails?number=${encodeURIComponent(card.number)}`, {
            signal: AbortSignal.timeout(10000)
          });
          if (r1.ok) {
            const d = await r1.json();
            name       = d.name;
            rarity     = d.rarity;
            setName    = d.setName;
            imageUrl   = d.imageUrl;
            cardDetails = d;
          }
        } catch(e1) { /* fall through */ }

        // Fallback to cardname API if name not found
        if (!name) {
          try {
            const r2 = await fetch(`/api/cardname?number=${encodeURIComponent(card.number)}`, {
              signal: AbortSignal.timeout(8000)
            });
            if (r2.ok) {
              const d2 = await r2.json();
              name    = name    || d2.name;
              rarity  = rarity  || d2.rarity;
              setName = setName || d2.setName;
              imageUrl = imageUrl || d2.imageUrl;
            }
          } catch(e2) { /* give up */ }
        }

        // Apply what we found
        if (name) card.name = name.replace(/\s*\([A-Z]{1,4}\d{1,2}.*/i, '').trim();
        if (rarity)  card.variant         = { suffix: '', label: rarity };
        if (setName && !['deck','latest','card','limitless'].some(w => setName.toLowerCase().includes(w))) {
          card.limitlessSetName = setName;
        }
        if (imageUrl) {
          card.imageUrl = imageUrl.includes('_EN.webp')
            ? imageUrl.replace('_EN.webp', `_${langParam}.webp`)
            : imageUrl;
        }
        if (cardDetails) card.cardDetails = cardDetails;
        if (name || rarity) enriched++;

      } catch(e) { console.log('Enrichment failed:', card.number, e.message); }

      // Render after every card so user sees names populating live
      Listings.render();
      await new Promise(r => setTimeout(r, 300));
    }

    Listings.save();
    Listings.render();

    if (statusEl) {
      statusEl.textContent = `✓ ${enriched} cards updated from Limitless TCG`;
      setTimeout(() => { statusEl.style.opacity = '0'; }, 4000);
    }
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
