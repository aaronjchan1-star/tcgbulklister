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
    'Relationship', 'RelationshipDetails'
  ];

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
  function variationName(card) {
    const hasName  = card.name && card.name !== card.number && card.name.trim() !== '';
    const namePart = hasName ? ` ${card.name}` : '';
    const variant  = card.variant?.label && card.variant.label !== 'Standard'
      ? ` ${card.variant.label}` : ' SR';
    return `${card.number}${namePart}${variant}`.substring(0, 65);
  }

  /* ─── Titles / Descriptions ─── */
  function buildTitle(setId, setName, game, lang, cond) {
    const raw = game === 'onePiece'
      ? `One Piece TCG ${setId} ${setName}${lang === 'Japanese' ? ' Japanese' : ''} SR Cards ${cond}`
      : `Pokemon TCG ${setName} Cards ${cond}`;
    return raw.length > 80 ? raw.substring(0, 77) + '...' : raw;
  }

  function buildDesc(cards, setId, setName, game) {
    const list = cards.map(c => {
      const hasName = c.name && c.name !== c.number;
      const variant = c.variant?.label && c.variant.label !== 'Standard' ? ` (${c.variant.label})` : '';
      return `• ${c.number}${hasName ? ' ' + c.name : ''}${variant} — $${c.price.toFixed(2)} AUD`;
    }).join('\n');

    const header = game === 'onePiece'
      ? [`One Piece TCG — ${setId} ${setName}`, `Super Rare (SR) Cards — Near Mint / Raw (Ungraded)`]
      : [`Pokemon TCG — ${setName}`, `Cards — Near Mint / Raw (Ungraded)`];

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
    const groups = {};
    for (const card of items) {
      const key = `${card.game}|${getSetId(card)}|${card.lang || 'EN'}|${card.cond}`;
      if (!groups[key]) groups[key] = { meta: card, cards: [] };
      groups[key].cards.push(card);
    }
    return Object.values(groups);
  }

  function sortCards(cards) {
    return [...cards].sort((a, b) => {
      const na = parseInt((a.number.split('-')[1] || a.number).replace(/\D/g, '')) || 0;
      const nb = parseInt((b.number.split('-')[1] || b.number).replace(/\D/g, '')) || 0;
      return na - nb;
    });
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
      '',               // Relationship — blank on parent
      parentRelDetails  // RelationshipDetails — pipe list
    ].map(esc).join(','));

    /* Variation child rows — Action must be BLANK on child rows, not 'Add' */
    sorted.forEach((c, i) => {
      rows.push([
        '',   // Action — blank for variation rows
        '', '', '', // Title, Category, ConditionID — blank
        c.price.toFixed(2),   // StartPrice
        c.qty,                // Quantity
        '', '', '', '',       // Format, Duration, Description, PicURL — blank
        '', '', '', '',       // Shipping fields — blank
        '', '', '',           // Location, Dispatch, Returns — blank
        'Variation',          // Relationship
        `Card=${allVarNames[i]}`  // RelationshipDetails = "Card=OP15-001 Luffy SR"
      ].map(esc).join(','));
    });

    return rows;
  }

  /* ─── Download ─── */
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

    const groups  = groupBySet(pricedItems);
    const allRows = [HEADERS.join(',')];
    groups.forEach(g => allRows.push(...buildGroupRows(g)));

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

  return { download };
})();