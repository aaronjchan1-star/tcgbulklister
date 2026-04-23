/**
 * csv.js
 * Generates and downloads the eBay File Exchange CSV for One Piece and Pokémon.
 */

const CSV = (() => {

  const HEADERS = [
    'Action(SiteID=Australia|Country=AU|Currency=AUD|Version=1193)',
    'Title', 'Category', 'ConditionID', 'Quantity',
    'StartPrice', 'BuyItNowPrice', 'Format', 'Duration',
    'Description', 'PicURL',
    'ShippingType', 'ShippingService-1:Option', 'ShippingService-1:Cost',
    'Location', 'DispatchTimeMax', 'ReturnsAcceptedOption', 'PaymentProfileName'
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
      raw = `${card.name} ${card.number} ${card.setName} Pokémon TCG ${card.cond}`;
    } else {
      const langTag = card.lang === 'Japanese' ? 'Japanese ' : '';
      raw = `${card.number} ${card.name} ${langTag}SR One Piece TCG ${card.cond}`;
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
    const shippingType   = card.post === 0 ? 'Free' : 'Flat';
    const shippingCost   = card.post === 0 ? '0.00' : card.post.toFixed(2);

    return [
      'Add',
      buildTitle(card),
      CATEGORY[card.game] || '183454',
      CONDITION_MAP[card.cond] || '4000',
      card.qty,
      card.price.toFixed(2),
      card.price.toFixed(2),
      'FixedPriceItem',
      'GTC',
      buildDescription(card),
      buildPicUrl(card),
      shippingType,
      'AU_Regular',
      shippingCost,
      'Sydney, NSW',
      '3',
      'ReturnsNotAccepted',
      'eBay Managed Payments'
    ].map(esc).join(',');
  }

  function download() {
    const items = Listings.getAll();
    if (items.length === 0) {
      alert('Add at least one card before downloading.');
      return;
    }
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
