/**
 * csv.js
 * Generates and downloads the eBay File Exchange CSV.
 *
 * eBay AU File Exchange format:
 * https://developer.ebay.com/devzone/file-exchange/docs/FileExchangeGettingStarted.html
 *
 * Category 183454 = Trading Card Games (eBay AU)
 * ConditionID: 4000 = Very Good, 3000 = Good (used for NM/LP/MP respectively)
 * Format: FixedPriceItem
 * Duration: GTC (Good 'Til Cancelled)
 *
 * PicURL: eBay fetches the image directly from the URL during CSV processing.
 * We use the Limitless TCG CDN which has images for every card by number.
 * Format: https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/{SET}/{CARD}_EN.webp
 */

const CSV = (() => {

  const HEADERS = [
    'Action(SiteID=Australia|Country=AU|Currency=AUD|Version=1193)',
    'Title',
    'Category',
    'ConditionID',
    'Quantity',
    'StartPrice',
    'BuyItNowPrice',
    'Format',
    'Duration',
    'Description',
    'PicURL',
    'ShippingType',
    'ShippingService-1:Option',
    'ShippingService-1:Cost',
    'Location',
    'DispatchTimeMax',
    'ReturnsAcceptedOption',
    'PaymentProfileName'
  ];

  const CONDITION_MAP = {
    'Near Mint':        '4000',
    'Lightly Played':   '4000',
    'Moderately Played':'3000'
  };

  function esc(value) {
    const v = String(value);
    if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }

  function buildTitle(card) {
    const langTag = card.lang === 'Japanese' ? 'Japanese ' : '';
    const raw = `${card.number} ${card.name} ${langTag}SR One Piece TCG Card ${card.cond}`;
    return raw.length > 80 ? raw.substring(0, 77) + '...' : raw;
  }

  function buildDescription(card) {
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

  function buildPicUrl(card) {
    const set     = card.number.split('-')[0].toUpperCase();
    const langTag = card.lang === 'Japanese' ? 'JP' : 'EN';
    return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${set}/${card.number}_${langTag}.webp`;
  }

  function buildRow(card) {
    const shippingType   = card.post === 0 ? 'Free' : 'Flat';
    const shippingOption = 'AU_Regular';
    const shippingCost   = card.post === 0 ? '0.00' : card.post.toFixed(2);

    return [
      'Add',
      buildTitle(card),
      '183454',
      CONDITION_MAP[card.cond] || '4000',
      card.qty,
      card.price.toFixed(2),
      card.price.toFixed(2),
      'FixedPriceItem',
      'GTC',
      buildDescription(card),
      buildPicUrl(card),
      shippingType,
      shippingOption,
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
    a.download = `one_piece_sr_ebay_${timestamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function timestamp() {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0')
    ].join('');
  }

  return { download };
})();
