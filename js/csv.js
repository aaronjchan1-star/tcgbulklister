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
    const setCode = (card.number?.split('-')[0] || '').toUpperCase();

    if (card.game === 'riftbound') {
      const rb = { OGN:'Origins', OGS:'Origins Proving Grounds', SFD:'Spiritforged', SFS:'Spiritforged Overnumbered', UNL:'Unleashed', ULS:'Unleashed Overnumbered', VEN:'Vendetta', ARC:'Arcane' };
      return card.limitlessSetName || rb[setCode] || '';
    }

    if (card.game === 'yugioh') {
      return card.limitlessSetName || '';
    }

    if (card.game === 'pokemon') {
      return card.setName || card.setId || '';
    }

    // One Piece
    if (isValidSetName(card.limitlessSetName)) return card.limitlessSetName;
    const n = { EB01:'Memorial Collection',EB02:'Anime 25th Collection',EB03:'Heroines Edition',EB04:'Egghead Crisis',OP01:'Romance Dawn',OP02:'Paramount War',OP03:'Pillars of Strength',OP04:'Kingdoms of Intrigue',OP05:'Awakening of the New Era',OP06:'Wings of the Captain',OP07:'500 Years in the Future',OP08:'Two Legends',OP09:'The Four Emperors',OP10:'Royal Blood',OP11:'A Fist of Divine Speed',OP12:'Legacy of the Master',OP13:'Carrying on his Will',OP14:"The Azure Sea's Seven",OP15:"Adventure on Kami's Island",OP16:'The Time of Battle',PRB01:'The Best Vol.1',PRB02:'The Best Vol.2',ST01:'Straw Hat Crew',ST02:'Worst Generation',ST03:'The Seven Warlords',ST04:'Animal Kingdom Pirates',ST05:'Worst Generation 2',ST06:'Absolute Justice',ST07:'Big Mom Pirates',ST08:'Monkey D. Luffy',ST09:'Yamato',ST10:'UTA',ST11:'Uta',ST12:'Zoro & Sanji',ST13:'The Three Captains',ST14:'3D2Y Luffy',ST15:'Red-Haired Pirates',ST16:'Marine',ST17:'Dark Forces',ST18:'World Government',ST19:'Final Chapter',ST20:'Charlotte Family',ST21:'Gear 5',ST28:'Yamato' };
    return n[setCode] || '';
  }

  function isValidSetName(name) {
    if (!name || name.length < 3) return false;
    const bad = ['deck','latest','card','limitless','result','filter','one piece tcg'];
    return !bad.some(w => name.toLowerCase().includes(w));
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
    const dispNum = card.game === 'pokemon' ? (card.printedNumber || card.number) : card.number;
    parts.push(`<h2>${name || card.number} &nbsp;<small>${dispNum}</small></h2>`);

    // Game + set name
    const gameNames = { onePiece:'One Piece TCG', pokemon:'Pokémon TCG', riftbound:'Riftbound', yugioh:'Yu-Gi-Oh! TCG' };
    const gameLabel = gameNames[card.game] || 'TCG';
    let setLine = setName ? `<strong>${gameLabel}</strong> · ${setName}` : `<strong>${gameLabel}</strong>`;
    // Pokemon: append variant/finish
    if (card.game === 'pokemon' && card.variant && card.variant !== 'Normal') {
      setLine += ` · ${card.variant}`;
    }
    parts.push(`<p>${setLine}</p>`);
    // Rarity line for all games
    const rarityLabel = card.game === 'pokemon'
      ? card.rarity
      : (card.variant?.label && !['Standard',''].includes(card.variant.label) ? card.variant.label : '');
    if (rarityLabel) {
      parts.push(`<p><b>Rarity:</b> ${rarityLabel}</p>`);
    }

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

  function variationOptionLabel(ci) {
    // Unique, buyer-friendly option: "Luffy OP07-026" (+ condition if not NM)
    let label = `${cleanName(ci.name || '')} ${ci.printedNumber || ci.number}`.trim();
    if (ci.cond && ci.cond !== 'Near Mint') label += ` (${ci.cond === 'Lightly Played' ? 'LP' : ci.cond === 'Moderately Played' ? 'MP' : ci.cond})`;
    // eBay variation option values must be <= 65 chars and not contain ; or |
    return label.replace(/[;|]/g, ' ').slice(0, 64);
  }

  function buildVariationsRows(card) {
    const items   = card.variationItems || [];
    const setName = card.setName || getSetName({ game: card.game, number: items[0] ? items[0].number : '' }) || card.setKey || '';
    const gLabel  = { onePiece:'One Piece', pokemon:'Pokémon', riftbound:'Riftbound', yugioh:'Yu-Gi-Oh!' }[card.game] || '';
    let title = `${setName} ${gLabel} Singles - Pick Your Card`.replace(/\s{2,}/g,' ').trim();
    if (title.length > 80) title = title.slice(0, 80);

    // Unique option labels (dedupe collisions by appending a counter)
    const seen = {};
    const opts = items.map(ci => {
      let o = variationOptionLabel(ci);
      if (seen[o]) { seen[o]++; o = `${o.slice(0, 60)} #${seen[o]}`; } else seen[o] = 1;
      ci.__opt = o;
      return o;
    });

    const attr = 'Card';
    const relMaster = `${attr}=${opts.join(';')}`;

    // Description: list every card with its condition
    const listHtml = items.map(ci => {
      const v = ci.variant ? ` — ${esc2(ci.variant)}` : '';
      return `<li><strong>${esc2(ci.__opt)}</strong>${v} · ${esc2(ci.cond || 'NM')}</li>`;
    }).join('');
    const desc = `<div style="font-family:Arial,sans-serif;max-width:600px;">`
      + `<h2>${esc2(setName)} ${esc2(gLabel)} Singles</h2>`
      + `<p>Select the card you want from the drop-down menu. Each card is sold individually.</p>`
      + `<ul>${listHtml}</ul>`
      + `<p>All cards are genuine and as described. Combined postage on multiple cards.</p>`
      + `</div>`;

    const cat  = CATEGORY[card.game] || '183454';
    const post = card.post || 0;
    const firstImg = items.find(c => c.imageUrl)?.imageUrl || '';

    // Master row: Relationship EMPTY, StartPrice EMPTY, Quantity EMPTY, RelationshipDetails = full option list
    const master = [
      'Add', title, cat, '4000',
      '',                 // StartPrice empty (item-level ignored for variations)
      '',                 // Quantity empty
      'FixedPriceItem', 'GTC',
      desc, firstImg,
      'Flat', 'AU_Regular',
      post === 0 ? '0.00' : post.toFixed(2),
      post === 0 ? '1' : '0',
      'Sydney, NSW', '3', 'ReturnsNotAccepted',
      ebayGame(card.game), ebayCardCondition(card.cond || 'Near Mint'),
      '',                 // Relationship EMPTY in master
      relMaster           // RelationshipDetails = Card=opt1;opt2;...
    ].map(esc).join(',');

    // Child rows: Relationship = Variation, own price/qty/pic
    const children = items.map(ci => [
      'Add', '', '', '',
      Math.max(1.00, ci.price || 0).toFixed(2),   // per-card price
      ci.qty || 1,                                 // per-card quantity
      '', '',
      '',                                          // no per-variation description
      ci.imageUrl || '',
      '', '', '', '',
      '', '', '',
      '', '',
      'Variation',                                 // Relationship
      `${attr}=${ci.__opt}`                        // RelationshipDetails = Card=thisOption
    ].map(esc).join(','));

    return [master, ...children];
  }

  function buildBulkRow(card) {
    const gameNames = { onePiece:'One Piece Card Game', pokemon:'Pokémon TCG', riftbound:'Riftbound', yugioh:'Yu-Gi-Oh! TCG' };
    const condWord  = card.cond === 'Mixed' ? '' : ` ${card.cond}`;
    let title = `${card.bulkCount} ${ {onePiece:'One Piece',pokemon:'Pokémon',riftbound:'Riftbound',yugioh:'Yu-Gi-Oh!'}[card.game] || '' } Cards Bulk Lot${condWord}`.replace(/\s{2,}/g,' ').trim();
    if (title.length > 80) title = title.substring(0, 80);

    // Description: intro + list of included cards
    const items = card.bulkItems || [];
    const listHtml = items.map(c => {
      const v = c.variant ? ` (${c.variant})` : '';
      const q = c.qty && c.qty > 1 ? ` x${c.qty}` : '';
      return `<li>${esc2(c.number)} — ${esc2(cleanName(c.name || ''))}${v}${q}</li>`;
    }).join('');
    const condLine = card.cond === 'Mixed' ? 'Mixed (see list)' : card.cond;
    const desc = `<div style="font-family:Arial,sans-serif;max-width:600px;">`
      + `<h2>${esc2(card.bulkCount)} ${esc2(gameNames[card.game] || 'TCG')} Cards — Bulk Lot</h2>`
      + `<p><strong>Condition:</strong> ${esc2(condLine)}</p>`
      + `<p>This lot contains the following ${esc2(card.bulkCount)} cards:</p>`
      + `<ul>${listHtml}</ul>`
      + `<p>All cards pictured/listed are included. Sold as one bulk lot.</p>`
      + `</div>`;

    const post = card.post || 0;
    return [
      'Add',
      title,
      CATEGORY[card.game] || '183454',
      card.cond === 'Moderately Played' ? '3000' : '4000',
      Math.max(1.00, card.price || 0).toFixed(2),
      1,                       // one bulk lot
      'FixedPriceItem', 'GTC',
      desc,
      '',                      // no single image
      'Flat', 'AU_Regular',
      post === 0 ? '0.00' : post.toFixed(2),
      post === 0 ? '1' : '0',
      'Sydney, NSW', '3',
      'ReturnsNotAccepted',
      ebayGame(card.game),
      card.cond === 'Mixed' ? '400010' : ebayCardCondition(card.cond),
      '', ''
    ].map(esc).join(',');
  }

  function esc2(s) { return String(s == null ? '' : s).replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function buildStandaloneLotRow(card) {
    if (card.listingType === 'bulk') return buildBulkRow(card);
    const name    = cleanName(card.name);
    const setName   = getSetName(card);
    const rarity    = card.variant?.label && card.variant.label !== 'Standard' ? card.variant.label : '';
    const isPlayset = card.listingType === 'playset';
    const lang      = card.lang === 'Japanese' ? ' Japanese' : '';
    let raw;

    const playsetSuffix = isPlayset ? ' Playset' : '';
    // setPart is empty if we couldn't resolve a real set name (avoids "OP16-098 OP16")
    const setPart = setName ? ` ${setName}` : '';

    if (card.game === 'riftbound') {
      raw = `${name} ${card.number}${setPart}${playsetSuffix}`;
    } else if (card.game === 'yugioh') {
      raw = `${name} ${card.number}${setPart}${playsetSuffix}`;
    } else if (card.game === 'pokemon') {
      // Pokemon: "Pikachu 025/198 Surging Sparks Reverse Holo"
      const variant = card.variant && card.variant !== 'Normal' ? ` ${card.variant}` : '';
      const pkNum   = card.printedNumber || card.number;
      raw = `${name} ${pkNum}${setPart}${variant}${playsetSuffix}`;
    } else {
      // One Piece
      raw = `${name} ${card.number}${lang}${setPart}${playsetSuffix}`;
    }
    // Collapse any accidental double spaces
    raw = raw.replace(/\s{2,}/g, ' ').trim();
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
      // Bulk lots sort to the end
      const ga = (a.listingType==='bulk'||a.listingType==='variations'), gb = (b.listingType==='bulk'||b.listingType==='variations');
      if (ga !== gb) return ga ? 1 : -1;
      const sa = (a.number || '').split('-')[0], sb = (b.number || '').split('-')[0];
      if (sa !== sb) return sa.localeCompare(sb);
      return (parseInt((a.number||'').split('-')[1]) || 0) - (parseInt((b.number||'').split('-')[1]) || 0);
    }).forEach(c => {
      if (c.listingType === 'variations') allRows.push(...buildVariationsRows(c));
      else allRows.push(buildStandaloneLotRow(c));
    });

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
  // Detect which TCG a card number belongs to, from its format
  function detectGame(number) {
    const n = (number || '').toUpperCase().trim();
    if (!n) return null;
    if (n.includes('/')) return 'pokemon';                              // 025/198
    if (/[- ]?(EN|JP|KR|AE|SP|IT|DE|FR|PT)\d{2,3}\b/i.test(n)) return 'yugioh';  // LOCR-JP001
    const prefix = n.split('-')[0];
    if (/^(OGN|OGS|SFD|SFS|UNL|ULS|VEN|ARC)$/.test(prefix)) return 'riftbound';
    if (/^(OP\d|EB\d|ST\d|PRB)/.test(prefix)) return 'onePiece';      // OP01, EB04, ST01, PRB01
    if (/^P-/.test(n)) return 'onePiece';                               // One Piece promo P-001
    return null;  // unknown — will use explicit Game column or default
  }

  function downloadTemplate() {
    // Clean, universal template. Game is auto-detected from the number; the Game
    // column is only needed to override or for ambiguous numbers.
    const headers = ['Game', 'Number', 'Qty', 'Condition', 'Listing Type', 'Language', 'Variant', 'Price'];
    const examples = [
      ['',          'OP07-026',    '1', 'NM', 'single',  '',         '',             ''     ],
      ['',          'OP14-031',    '3', 'NM', 'single',  '',         '',             ''     ],
      ['',          'EB04-002',    '1', 'NM', 'playset', '',         '',             ''     ],
      ['',          'OP14-031',    '1', 'NM', 'single',  'Japanese', '',             '12.00'],
      ['',          '025/198',     '1', 'NM', 'single',  '',         'Reverse Holo', ''     ],
      ['',          '199/091',     '1', 'LP', 'single',  '',         'Holo',         ''     ],
      ['',          'LOCR-JP001',  '2', 'NM', 'single',  '',         '',             ''     ],
      ['',          'UNL-053',     '1', 'NM', 'single',  '',         '',             ''     ],
    ];
    // Compact instructions in a trailing column so they never clash with data
    const guide = [
      'HOW TO USE THIS TEMPLATE',
      '',
      'Fill one row per card. Only Number is required — everything else is optional.',
      'Card name, set, rarity and image are looked up automatically after import.',
      '',
      'COLUMNS',
      '  Game          Usually leave BLANK — auto-detected from the number.',
      '                Override with: onepiece / pokemon / riftbound / yugioh',
      '  Number        Card number exactly as printed.',
      '                  One Piece : OP07-026, EB04-002, ST01-001',
      '                  Pokemon   : 025/198  (number/set total)',
      '                  Yu-Gi-Oh! : LOCR-JP001  (set-lang+number)',
      '                  Riftbound : UNL-053, OGN-001',
      '  Qty           eBay stock count. 1 = single copy. Default 1.',
      '  Condition     NM (Near Mint) / LP (Lightly Played) / MP. Default NM.',
      '  Listing Type  single  = one listing (Qty sets the stock count)',
      '                playset = a bundle of 4 cards sold together',
      '  Language      Blank = English. Or: Japanese',
      '  Variant       Pokemon finish: Holo / Reverse Holo / Poke Ball / Master Ball',
      '                (leave blank for non-holo / other games)',
      '  Price         Blank = auto-price from eBay+Claude. Or set e.g. 5.00',
      '',
      'TIPS',
      '  - Numbers auto-detect the game, so a mixed list of all four TCGs works.',
      '  - Delete the example rows before importing your own cards.',
    ];

    const rows = [];
    rows.push([...headers, '', 'GUIDE ↓'].map(esc).join(','));
    const maxLen = Math.max(examples.length, guide.length);
    for (let i = 0; i < maxLen; i++) {
      const ex = examples[i] || ['', '', '', '', '', '', '', ''];
      const gd = guide[i] != null ? guide[i] : '';
      rows.push([...ex, '', gd].map(esc).join(','));
    }
    triggerDownload(rows.join('\r\n'), 'tcg_lister_template.csv');
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

        const col = (name, fallback) => {
          if (!hasHeaders) return fallback;
          const idx = headerLine.indexOf(name);
          return idx >= 0 ? idx : -1;
        };
        const colGame  = col('game', -1);
        const colNum   = col('number', 0);
        const colQty   = col('qty', 1);
        const colCond  = col('condition', -1);
        const colLtype = col('listingtype', -1);
        const colLang  = col('language', -1);
        const colVar   = col('variant', -1);
        const colPrice = col('price', -1);
        const colDesc  = col('description', -1);

        const get = (vals, idx) => idx >= 0 && vals[idx] != null ? vals[idx].trim() : '';
        const condMap = { NM:'Near Mint', LP:'Lightly Played', MP:'Moderately Played',
          'NEAR MINT':'Near Mint', 'LIGHTLY PLAYED':'Lightly Played', 'MODERATELY PLAYED':'Moderately Played' };

        const imported = [];
        let skipped = 0;

        for (let i = startRow; i < lines.length; i++) {
          const vals = parseCSVLine(lines[i]);
          if (vals.every(v => !v || !v.trim())) continue;

          const number = get(vals, colNum).toUpperCase();
          if (!number) { continue; }

          // Game: explicit column, else auto-detect from number format
          let game = get(vals, colGame).toLowerCase().replace(/[^a-z]/g, '');
          const gameAlias = { onepiece:'onePiece', op:'onePiece', pokemon:'pokemon', pkmn:'pokemon',
            pkm:'pokemon', riftbound:'riftbound', rb:'riftbound', yugioh:'yugioh', ygo:'yugioh', ygioh:'yugioh' };
          game = gameAlias[game] || detectGame(number);
          if (!game) { skipped++; continue; }   // can't tell the game — skip

          const qtyRaw    = parseInt(get(vals, colQty) || '1') || 1;
          const condRaw   = get(vals, colCond).toUpperCase();
          const cond      = condMap[condRaw] || 'Near Mint';
          const ltypeRaw  = get(vals, colLtype).toLowerCase();
          const isPlayset = ltypeRaw === 'playset';
          const langRaw   = get(vals, colLang).toLowerCase();
          let   lang      = langRaw === 'japanese' ? 'Japanese'
                          : langRaw === 'korean' ? 'Korean'
                          : langRaw.startsWith('asian') ? 'Asian-English' : 'English';
          // Yu-Gi-Oh: detect language from set code if not given
          if (game === 'yugioh' && lang === 'English') {
            const lc = number.match(/-([A-Z]{2})\d/)?.[1];
            if (lc === 'JP') lang = 'Japanese'; else if (lc === 'KR') lang = 'Korean'; else if (lc === 'AE') lang = 'Asian-English';
          }
          const variant   = get(vals, colVar);
          const priceRaw  = colPrice >= 0 ? (parseFloat(get(vals, colPrice)) || 0) : 0;
          const customDesc = colDesc >= 0 && get(vals, colDesc) ? get(vals, colDesc) : null;

          const listingType = isPlayset ? 'playset' : 'lot';
          const finalQty    = isPlayset ? 4 : qtyRaw;
          const numPlaysets = isPlayset ? Math.max(1, qtyRaw) : 1;

          // Pokemon stores finish in .variant (string); others store rarity in variant.label
          const cardBase = {
            game,
            number,
            name:        number,   // enriched after import
            lang,
            cond,
            qty:         finalQty,
            price:       priceRaw,
            post:        0,
            listingType,
            customDesc,
          };
          if (game === 'pokemon') {
            cardBase.variant = variant || 'Normal';
            cardBase.rarity  = null;
          } else {
            cardBase.variant = { suffix: '', label: variant || '' };
          }

          const copies = isPlayset ? numPlaysets : 1;
          for (let p = 0; p < copies; p++) imported.push({ ...cardBase });
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
        enrichImported(Listings.getAll());

      } catch(err) {
        const s2 = document.getElementById('save-status');
        if (s2) { s2.textContent = 'Import failed: ' + err.message; s2.style.opacity='1'; setTimeout(()=>s2.style.opacity='0',5000); }
      }
      input.value = '';
    };
    reader.readAsText(file);
  }

  /* ─── Bulk enrich imported cards with Limitless data ─── */
  async function enrichImported(importedItems) {
    const statusEl = document.getElementById('save-status');
    let enriched = 0;
    const allItems = Listings.getItems();
    const startIdx = allItems.length - importedItems.length;

    for (let i = 0; i < importedItems.length; i++) {
      const card = allItems[startIdx + i];
      if (!card) continue;

      if (statusEl) {
        statusEl.textContent = `Looking up ${i + 1}/${importedItems.length}: ${card.number}...`;
        statusEl.style.opacity = '1';
      }

      try {
        if (card.game === 'onePiece') {
          const r = await fetch(`/api/carddetails?number=${encodeURIComponent(card.number)}`, { signal: AbortSignal.timeout(10000) });
          if (r.ok) {
            const d = await r.json();
            if (d.name) card.name = d.name.replace(/\s*\([A-Z]{1,4}\d{1,2}.*/i, '').trim();
            if (d.rarity && !card.variant?.label) card.variant = { suffix: '', label: d.rarity };
            if (d.setName && !['deck','latest','card','limitless'].some(w => d.setName.toLowerCase().includes(w))) card.limitlessSetName = d.setName;
            if (d.imageUrl) card.imageUrl = card.lang === 'Japanese' ? d.imageUrl.replace('_EN.webp','_JP.webp') : d.imageUrl;
            card.cardDetails = d;
            if (d.name) enriched++;
          }
        } else if (card.game === 'riftbound') {
          const r = await fetch(`/api/riftbound?number=${encodeURIComponent(card.number)}`, { signal: AbortSignal.timeout(10000) });
          if (r.ok) {
            const d = await r.json();
            if (d.name) { card.name = d.name; enriched++; }
            if (d.rarity && !card.variant?.label) card.variant = { suffix: '', label: d.rarity };
            if (d.setName) card.limitlessSetName = d.setName;
            if (d.imageUrl) card.imageUrl = d.imageUrl;
            card.cardDetails = d;
          }
        } else if (card.game === 'yugioh') {
          const r = await fetch(`/api/yugioh?number=${encodeURIComponent(card.number)}`, { signal: AbortSignal.timeout(10000) });
          if (r.ok) {
            const d = await r.json();
            if (d.name) { card.name = d.name; enriched++; }
            if (d.rarity && !card.variant?.label) card.variant = { suffix: '', label: d.rarity };
            if (d.setName) card.limitlessSetName = d.setName;
            if (d.imageUrl) card.imageUrl = d.imageUrl;
            if (d.lang) card.lang = d.lang;
            card.cardDetails = d;
          }
        } else if (card.game === 'pokemon') {
          const numOnly = card.number.split('/')[0];
          const total   = card.number.split('/')[1];
          let q = `number:${numOnly}`;
          if (total) q += ` set.printedTotal:${total}`;
          const r = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&select=id,name,number,set,images,rarity,tcgplayer&orderBy=-set.releaseDate&pageSize=5`, { signal: AbortSignal.timeout(10000) });
          if (r.ok) {
            const data = await r.json();
            const c = data.data?.[0];
            if (c) {
              card.name          = c.name;
              card.setId         = c.set.id;
              card.setName       = c.set.name;
              card.printedNumber = `${c.number}/${c.set.printedTotal || c.set.total}`;
              if (!card.rarity) card.rarity = c.rarity || null;
              card.imageUrl      = c.images?.large || c.images?.small || '';
              const prices = c.tcgplayer?.prices || {};
              const v = card.variant;
              let usd = null;
              if (v === 'Holo')              usd = prices.holofoil?.market || prices.holofoil?.mid;
              else if (v === 'Reverse Holo') usd = prices.reverseHolofoil?.market || prices.reverseHolofoil?.mid;
              else                            usd = (prices.normal || prices.holofoil)?.market || (prices.normal || prices.holofoil)?.mid;
              card.tcgUsdPrice = usd || null;
              if (!card.price && usd) card.price = Math.max(1.00, Math.round(usd * 1.5 * 100) / 100);
              enriched++;
            }
          }
        }
      } catch(e) { /* enrichment is best-effort */ }

      Listings.render();
      await new Promise(r => setTimeout(r, 250));
    }

    Listings.save();
    Listings.render();
    if (statusEl) {
      statusEl.textContent = `✓ ${enriched} card${enriched !== 1 ? 's' : ''} updated with names, sets & images`;
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
