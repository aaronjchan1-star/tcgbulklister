/**
 * js/rarities.js
 * Complete rarity systems for each supported TCG (verified current as of mid-2026).
 * value = stored code · label = shown in dropdown.
 */
const RARITIES = {
  onePiece: [
    { value: '',     label: '— select rarity —' },
    { value: 'C',    label: 'Common (C)' },
    { value: 'UC',   label: 'Uncommon (UC)' },
    { value: 'R',    label: 'Rare (R)' },
    { value: 'SR',   label: 'Super Rare (SR)' },
    { value: 'SEC',  label: 'Secret Rare (SEC)' },
    { value: 'L',    label: 'Leader (L)' },
    { value: 'SP',   label: 'Special (SP CARD)' },
    { value: 'P',    label: 'Promo (P)' },
    { value: 'Manga Rare',  label: 'Manga Rare' },
    { value: 'Parallel',    label: 'Parallel / Alt Art' },
    { value: 'Full Art',    label: 'Full Art' },
  ],

  pokemon: [
    { value: '',     label: '— select rarity —' },
    { value: 'Common',    label: 'Common' },
    { value: 'Uncommon',  label: 'Uncommon' },
    { value: 'Rare',      label: 'Rare (Holo)' },
    { value: 'Double Rare',  label: 'Double Rare (ex) ★★' },
    { value: 'Ultra Rare',   label: 'Ultra Rare / Full Art ★★' },
    { value: 'Illustration Rare',          label: 'Illustration Rare (IR) ★' },
    { value: 'Special Illustration Rare',  label: 'Special Illustration Rare (SIR) ★★' },
    { value: 'Hyper Rare',   label: 'Hyper Rare (Gold) ★★★' },
    { value: 'ACE SPEC',     label: 'ACE SPEC Rare' },
    { value: 'Shiny Rare',         label: 'Shiny Rare' },
    { value: 'Shiny Ultra Rare',   label: 'Shiny Ultra Rare' },
    { value: 'Mega Attack Rare',   label: 'Mega Attack Rare (MAR)' },
    { value: 'Mega Hyper Rare',    label: 'Mega Hyper Rare' },
  ],

  riftbound: [
    { value: '',     label: '— select rarity —' },
    { value: 'C',    label: 'Common' },
    { value: 'UC',   label: 'Uncommon' },
    { value: 'R',    label: 'Rare' },
    { value: 'E',    label: 'Epic' },
    { value: 'ON',   label: 'Overnumbered' },
    { value: 'Alt Art',   label: 'Alt Art (hexagon)' },
    { value: 'Signature', label: 'Signature (stamped)' },
    { value: 'UR',   label: 'Ultimate Rare' },
    { value: 'Promo', label: 'Promo' },
  ],

  yugioh: [
    { value: '',     label: '— select rarity —' },
    { value: 'C',     label: 'Common' },
    { value: 'R',     label: 'Rare' },
    { value: 'SR',    label: 'Super Rare' },
    { value: 'UR',    label: 'Ultra Rare' },
    { value: 'ScR',   label: 'Secret Rare' },
    { value: 'UtR',   label: 'Ultimate Rare' },
    { value: 'GR',    label: 'Ghost Rare' },
    { value: 'GUR',   label: 'Gold Rare' },
    { value: 'CR',    label: "Collector's Rare" },
    { value: 'StR',   label: 'Starlight Rare' },
    { value: 'QCSR',  label: 'Quarter Century Secret Rare' },
    { value: 'PScR',  label: 'Prismatic Secret Rare' },
    { value: 'PlScR', label: 'Platinum Secret Rare' },
    { value: 'SP',    label: 'Short Print' },
  ],
};

// Map a raw rarity string (from an API) to our dropdown value
function normaliseRarity(game, raw) {
  if (!raw) return '';
  const list = RARITIES[game] || [];
  const r = raw.trim();
  // Exact value match
  if (list.some(o => o.value === r)) return r;
  // Case-insensitive label/value contains
  const lower = r.toLowerCase();
  const hit = list.find(o =>
    o.value.toLowerCase() === lower ||
    o.label.toLowerCase().includes(lower)
  );
  return hit ? hit.value : r;  // fall back to the raw value if unmatched
}
