/**
 * csv.js
 * Generates and downloads the eBay File Exchange CSV for One Piece and Pokémon.
 */

const CSV = (() => {

  const HEADERS = [
    'Action(SiteID=Australia|Country=AU|Currency=AUD|Version=1193)',
    'Title', 'Category', 'ConditionID', 'Quantity',
    'StartPrice', 'Format', 'Duration',
    'Description', 'PicURL',
    'ShippingType', 'ShippingService-1:Option', 'ShippingService-1:Cost',
    'ShippingService-1:FreeShipping',
    'Location', 'DispatchTimeMax', 'ReturnsAcceptedOption'
  ];

  const CONDITION_MAP = {
    'Near Mint':        '4000',
    'Lightly Played':   '4000',
    'Moderately Played':'3000'
  };

  // eBay AU category IDs
  const CATEGORY = {
    onePiece: '183454',  // Trading Card Games
    pokemon:  '2536'     // Pokémon TCG
  };

  const OP_IMG  = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece';
  const PKM_IMG = 'https://images.pokemontcg.io';

  function esc(value) {
    const v = String(value);
    if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }

  function buildPicUrl(card) {
    if (card.game === 'pokemon') {
      return `${PKM_IMG}/${card.setId}/${card.number}_hires.png`;
    }
    const set     = card.number.split('-')[0].toUpperCase();
    const langTag = card.lang === 'Japanese' ? 'JP' : 'EN';
    return `${OP_IMG}/${set}/${card.number}_${langTag}.webp`;
  }

  function buildTitle(card) {
    let raw;
    if (card.game === 'pokemon') {
      raw = `${card.name} ${card.number} ${card.setName} Pokemon TCG ${card.cond}`;
    } else {
      const langTag  = card.lang === 'Japanese' ? 'Japanese ' : '';
      const variant  = card.variant?.label && card.variant.label !== 'Standard' ? ` ${card.variant.label}` : '';
      // Only include name if it differs from the number
      const nameTag  = card.name && card.name !== card.number ? ` ${card.name}` : '';
      raw = `${card.number}${nameTag}${variant} ${langTag}SR One Piece TCG ${card.cond}`;
    }
    return raw.length > 80 ? raw.substring(0, 77) + '...' : raw;
  }

  function buildDescription(card) {
    if (card.game === 'pokemon') {
      return [
        `${card.name} — ${card.setName} (${card.number})`,
        `Pokémon Trading Card Game`,
        `Condition: ${card.cond}`,
        ``,
        `Card is shipped securely in a protective sleeve and rigid toploader.`,
        `Combined postage available — please request an invoice before paying if purchasing multiple cards.`,
        ``,
        `Australian seller based in Sydney, NSW.`,
        `Fast dispatch within 3 business days of cleared payment.`
      ].join('\n');
    }
    return [
      `${card.name} (${card.number})`,
      `One Piece TCG — Super Rare (SR)`,
      `Language: ${card.lang}`,
      `Condition: ${card.cond}`,
      ``,
      `Card is shipped securely in a protective sleeve and rigid toploader.`,
      `Combined postage available — please request an invoice before paying if purchasing multiple cards.`,
      ``,
      `Australian seller based in Sydney, NSW.`,
      `Fast dispatch within 3 business days of cleared payment.`
    ].join('\n');
  }

  function buildRow(card) {
    // eBay AU File Exchange: always use Flat, set cost to 0.00 for free shipping
    const shippingType = 'Flat';
    const shippingCost = card.post === 0 ? '0.00' : card.post.toFixed(2);

    return [
      'Add',
      buildTitle(card),
      CATEGORY[card.game] || '183454',
      CONDITION_MAP[card.cond] || '4000',
      card.qty,
      card.price.toFixed(2),
      'FixedPriceItem',
      'GTC',
      buildDescription(card),
      buildPicUrl(card),
      shippingType,
      'AU_Regular',
      shippingCost,
      card.post === 0 ? '1' : '0',
      'Sydney, NSW',
      '3',
      'ReturnsNotAccepted'
    ].map(esc).join(',');
  }

  function parseCardNumber(num) {
    // Parse "OP01-060" or "025/198" into sortable parts
    if (!num) return { set: 'ZZZ', n: 9999 };
    // One Piece format: OP01-060, ST07-003 etc
    const opMatch = num.match(/^([A-Z]+)(\d+)-(\d+)/);
    if (opMatch) return { set: opMatch[1] + opMatch[2].padStart(4,'0'), n: parseInt(opMatch[3]) };
    // Pokémon format: 215 or 025/198
    const pkMatch = num.match(/^(\d+)/);
    if (pkMatch) return { set: 'PKM', n: parseInt(pkMatch[1]) };
    return { set: num, n: 0 };
  }

  function sortItems(items) {
    return [...items].sort((a, b) => {
      // Sort by game first (One Piece before Pokémon)
      if (a.game !== b.game) return a.game === 'onePiece' ? -1 : 1;

      // Then by set
      const pa = parseCardNumber(a.number);
      const pb = parseCardNumber(b.number);
      if (pa.set !== pb.set) return pa.set.localeCompare(pb.set);

      // Then by number within set
      return pa.n - pb.n;
    });
  }

  function download() {
    const rawItems = Listings.getAll();
    if (rawItems.length === 0) {
      alert('Add at least one card before downloading.');
      return;
    }

    // Filter out unpriced/invalid cards — eBay AU minimum price is $1.00
    const pricedItems   = rawItems.filter(c => c.price && c.price >= 1.00);
    const unpricedCount = rawItems.length - pricedItems.length;

    if (pricedItems.length === 0) {
      alert('No cards have valid prices (minimum $1.00 on eBay AU). Use Claude AI Price Research or set prices manually.');
      return;
    }

    if (unpricedCount > 0) {
      const ok = confirm(`${unpricedCount} card${unpricedCount !== 1 ? 's are' : ' is'} unpriced and will be skipped.\n\nDownload CSV for the ${pricedItems.length} priced card${pricedItems.length !== 1 ? 's' : ''}?`);
      if (!ok) return;
    }

    const items = sortItems(pricedItems);
    const rows = [HEADERS.join(','), ...items.map(buildRow)];
    const csv  = rows.join('\r\n');
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
