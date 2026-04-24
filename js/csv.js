/**
 * csv.js
 * Generates eBay File Exchange CSV using Variation listings.
 * Cards are grouped by set — one parent listing per set,
 * each card is a variation within that listing.
 *
 * eBay File Exchange Variation format:
 * - Parent row: Action=Add with full listing details, no price/qty
 * - Child rows: Action=Add, Relationship=Variation, with price/qty/specifics
 */

const CSV = (() => {

  // eBay AU category IDs
  const CATEGORY = { onePiece: '183454', pokemon: '2536' };

  const CONDITION_MAP = {
    'Near Mint':        '4000',
    'Lightly Played':   '4000',
    'Moderately Played':'3000'
  };

  const OP_CDN  = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece';
  const PKM_CDN = 'https://images.pokemontcg.io';

  // Parent listing headers
  const PARENT_HEADERS = [
    'Action(SiteID=Australia|Country=AU|Currency=AUD|Version=1193)',
    'Title', 'Category', 'ConditionID', 'Format', 'Duration',
    'Description', 'PicURL',
    'ShippingType', 'ShippingService-1:Option', 'ShippingService-1:Cost',
    'ShippingService-1:FreeShipping',
    'Location', 'DispatchTimeMax', 'ReturnsAcceptedOption',
    'Relationship', 'RelationshipDetails',
    'Variation:StartPrice', 'Variation:Quantity'
  ];

  function esc(value) {
    const v = String(value == null ? '' : value);
    if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }

  function getSetId(card) {
    if (card.game === 'onePiece') {
      return card.number.split('-')[0].toUpperCase(); // OP01, OP15, ST07 etc
    }
    return card.setId || 'PKM';
  }

  function getSetName(card) {
    if (card.game === 'onePiece') {
      const setId = getSetId(card);
      // Map common set IDs to friendly names
      const names = {
        OP01:'Romance Dawn', OP02:'Paramount War', OP03:'Pillars of Strength',
        OP04:'Kingdoms of Intrigue', OP05:'Awakening of the New Era',
        OP06:'Wings of the Captain', OP07:'500 Years in the Future',
        OP08:'Two Legends', OP09:'The Four Emperors', OP10:'Royal Blood',
        OP11:'Memoir of Upheaval', OP12:'The Grandline Chronicles',
        OP13:'Hero of Justice', OP14:'3D2Y', OP15:'Sealed Memories',
        ST01:'Straw Hat Crew', ST02:'Worst Generation', ST03:'The Seven Warlords',
        ST04:'Animal Kingdom Pirates', ST05:'Worst Generation 2',
        ST06:'Absolute Justice', ST07:'Big Mom Pirates', ST08:'Monkey D. Luffy',
        ST09:'Yamato', ST10:'UTA', ST11:'Uta', ST12:'Zoro & Sanji',
        ST13:'The Three Captains', ST14:'3D2Y Luffy', ST15:'Red-Haired Pirates',
        ST16:'Marine', ST17:'Dark Forces', ST18:'World Government', ST19:'Final Chapter'
      };
      return names[setId] || setId;
    }
    return card.setName || card.setId;
  }

  function buildParentTitle(setId, setName, game, lang, cond) {
    if (game === 'onePiece') {
      const langTag = lang === 'Japanese' ? ' Japanese' : '';
      const raw = `One Piece TCG ${setId} ${setName}${langTag} SR Cards ${cond}`;
      return raw.length > 80 ? raw.substring(0, 77) + '...' : raw;
    }
    const raw = `Pokemon TCG ${setName} Cards ${cond}`;
    return raw.length > 80 ? raw.substring(0, 77) + '...' : raw;
  }

  function buildParentDescription(cards, setId, setName, game) {
    const cardList = cards.map(c => {
      const variant  = c.variant?.label && c.variant.label !== 'Standard' ? ` (${c.variant.label})` : '';
      const hasName  = c.name && c.name !== c.number && c.name.trim() !== '';
      const namePart = hasName ? ` ${c.name}` : '';
      return `• ${c.number}${namePart}${variant} — $${c.price.toFixed(2)} AUD`;
    }).join('\n');

    if (game === 'onePiece') {
      return [
        `One Piece TCG — ${setId} ${setName}`,
        `Super Rare (SR) Cards — Near Mint / Raw (Ungraded)`,
        ``,
        `Cards available in this listing:`,
        cardList,
        ``,
        `Each card is shipped securely in a protective sleeve and rigid toploader.`,
        `Select the card you want from the variation dropdown above.`,
        `Combined postage available — request an invoice before paying if buying multiple.`,
        ``,
        `Australian seller based in Sydney, NSW.`,
        `Fast dispatch within 3 business days of cleared payment.`
      ].join('\n');
    }

    return [
      `Pokemon TCG — ${setName}`,
      `Cards — Near Mint / Raw (Ungraded)`,
      ``,
      `Cards available in this listing:`,
      cardList,
      ``,
      `Each card is shipped securely in a protective sleeve and rigid toploader.`,
      `Select the card you want from the variation dropdown above.`,
      `Combined postage available — request an invoice before paying if buying multiple.`,
      ``,
      `Australian seller based in Sydney, NSW.`,
      `Fast dispatch within 3 business days of cleared payment.`
    ].join('\n');
  }

  function getParentImage(cards) {
    // Use first card's image as the listing thumbnail
    const first = cards[0];
    if (first.imageUrl) return first.imageUrl;
    if (first.game === 'onePiece') {
      const set     = first.number.split('-')[0].toUpperCase();
      const suffix  = first.variant?.suffix || '';
      const langTag = first.lang === 'Japanese' ? 'JP' : 'EN';
      return `${OP_CDN}/${set}/${first.number}${suffix}_${langTag}.webp`;
    }
    return `${PKM_CDN}/${first.setId}/${first.number}_hires.png`;
  }

  function buildVariationSpecifics(card) {
    // Format: "OP05-110 Sanji SR" or "OP05-110 SEC Gold" etc
    const variant  = card.variant?.label && card.variant.label !== 'Standard'
      ? ` ${card.variant.label}` : ' SR';
    // Use card name if it was fetched and is different from the number
    const hasName  = card.name && card.name !== card.number && card.name.trim() !== '';
    const namePart = hasName ? ` ${card.name}` : '';
    return `${card.number}${namePart}${variant}`.substring(0, 65); // eBay variation name limit
  }

  function groupBySet(items) {
    const groups = {};
    for (const card of items) {
      // Group key: game + setId + language + condition
      // (separate listings for JP vs EN, NM vs LP)
      const key = `${card.game}|${getSetId(card)}|${card.lang || 'EN'}|${card.cond}`;
      if (!groups[key]) groups[key] = { card, cards: [] };
      groups[key].cards.push(card);
    }
    return Object.values(groups);
  }

  function parseCardNumber(num) {
    if (!num) return { set: 'ZZZ', n: 9999 };
    const opMatch = num.match(/^([A-Z]+)(\d+)-(\d+)/);
    if (opMatch) return { set: opMatch[1] + opMatch[2].padStart(4,'0'), n: parseInt(opMatch[3]) };
    const pkMatch = num.match(/^(\d+)/);
    if (pkMatch) return { set: 'PKM', n: parseInt(pkMatch[1]) };
    return { set: num, n: 0 };
  }

  function sortCards(cards) {
    return [...cards].sort((a, b) => {
      const pa = parseCardNumber(a.number);
      const pb = parseCardNumber(b.number);
      return pa.n - pb.n;
    });
  }

  function buildRows(group) {
    const { card: firstCard, cards } = group;
    const sorted   = sortCards(cards);
    const setId    = getSetId(firstCard);
    const setName  = getSetName(firstCard);
    const game     = firstCard.game;
    const lang     = firstCard.lang || 'EN';
    const cond     = firstCard.cond;
    const post     = firstCard.post || 0;

    const rows = [];

    // ── Parent listing row ──────────────────────────────────
    const parentRow = [
      'Add',
      buildParentTitle(setId, setName, game, lang, cond),
      CATEGORY[game] || '183454',
      CONDITION_MAP[cond] || '4000',
      'FixedPriceItem',
      'GTC',
      buildParentDescription(sorted, setId, setName, game),
      getParentImage(sorted),
      'Flat',
      'AU_Regular',
      post === 0 ? '0.00' : post.toFixed(2),
      post === 0 ? '1' : '0',
      'Sydney, NSW',
      '3',
      'ReturnsNotAccepted',
      '',   // Relationship — blank for parent
      '',   // RelationshipDetails — blank for parent
      '',   // Variation:StartPrice — blank for parent
      ''    // Variation:Quantity — blank for parent
    ];
    rows.push(parentRow.map(esc).join(','));

    // ── Variation rows (one per card) ───────────────────────
    for (const c of sorted) {
      const varName = buildVariationSpecifics(c);
      const varRow = [
        'Add',
        '',   // Title — blank for variation
        '',   // Category — blank for variation
        '',   // ConditionID — blank for variation
        '',   // Format — blank for variation
        '',   // Duration — blank for variation
        '',   // Description — blank for variation
        '',   // PicURL — blank for variation
        '',   // ShippingType — blank for variation
        '',   // ShippingService — blank for variation
        '',   // ShippingCost — blank for variation
        '',   // FreeShipping — blank for variation
        '',   // Location — blank for variation
        '',   // DispatchTimeMax — blank for variation
        '',   // ReturnsAcceptedOption — blank for variation
        'Variation',
        varName,
        c.price.toFixed(2),
        c.qty
      ];
      rows.push(varRow.map(esc).join(','));
    }

    return rows;
  }

  function download() {
    const rawItems = Listings.getAll();
    if (rawItems.length === 0) {
      alert('Add at least one card before downloading.');
      return;
    }

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

    const groups = groupBySet(pricedItems);
    const allRows = [PARENT_HEADERS.join(',')];
    for (const group of groups) {
      allRows.push(...buildRows(group));
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

  return { download };
})();
