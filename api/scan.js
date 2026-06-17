/**
 * api/scan.js
 * Identifies a TCG card from a scanned image using Claude vision.
 * Returns: { game, number, name, variant, confidence }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image, mediaType } = req.body;
  if (!image) return res.status(400).json({ error: 'Missing image data' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'No API key' });

  const prompt = `You are identifying a trading card from a scanned image. Look carefully at the card and extract these details.

STEP 1 — Identify the trading card game. Use both the artwork/layout AND the collector number format:
- "onePiece" — One Piece Card Game. Anime pirate art; DON!! / Life icons; coloured border (red/green/blue/purple/black/yellow). Collector numbers: OP07-026, EB01-012, ST01-001, PRB01-001.
- "pokemon" — Pokémon TCG. Pokémon creature; HP top-right; energy symbols. Collector numbers use a slash: 025/198, 6/102, 199/091.
- "yugioh" — Yu-Gi-Oh! Monster/Spell/Trap; ATK/DEF at bottom; Level stars or Link arrows. Collector numbers: LOCR-JP001, POTE-EN001 (SET-LANGUAGE+digits, e.g. -JP/-EN/-KR).
- "riftbound" — Riftbound (League of Legends). LoL champions/runes; energy & might icons. Collector numbers: OGN-001, UNL-053, SFD-001, VEN-001.

If unsure between One Piece and Riftbound (both use SET-### numbers), use the artwork: anime pirates = One Piece, League of Legends champions = Riftbound.

STEP 0 — Is this the FRONT of a single trading card? If you see a card BACK (the patterned reverse — e.g. the blue/brown Pokémon back, the brown Yu-Gi-Oh back, the One Piece back), or there is no card, or the image is too blurry to read, set "cardBack" to true and stop — do not guess a card.

STEP 2 — Read the collector number EXACTLY as printed (usually a bottom corner).

For the card name, read the title printed on the card.

STEP 3 — Variant / finish. Be CONSERVATIVE: only call something a ball pattern if you can clearly see the tiled ball icons. When unsure, say "Holo" or "unknown" rather than guessing a ball pattern.
- Pokémon finish:
  - "Master Ball" — ONLY if the foil is visibly made of many small repeating MASTER BALL icons (purple ball with a pink M) tiled across the whole card. This is rare. Do NOT guess this just because the card looks shiny.
  - "Poke Ball" — ONLY if the foil is visibly made of many small repeating POKÉ BALL icons (red-and-white balls) tiled across the whole card.
  - "Reverse Holo" — foil covers everything EXCEPT the main artwork box.
  - "Holo" — foil shimmer in the artwork; full-art / illustration / secret-rare cards are "Holo".
  - "Normal" — no foil.
  IMPORTANT: A full-art card, an "ex" with full-art treatment, a Trainer full art, or any card whose number is ABOVE the set total (a secret rare) is NOT a ball-pattern card — call those "Holo", never "Master Ball" or "Poke Ball". Ball patterns only appear on ordinary cards, not secret rares.
- Other games: note alternate art or special rarity only if obvious, else "unknown".

Respond ONLY with JSON, no other text:
{"cardBack":false,"game":"onePiece|pokemon|yugioh|riftbound","number":"exact collector number","name":"card name","variant":"Normal|Holo|Reverse Holo|Poke Ball|Master Ball|Alt Art|unknown","confidence":"high|medium|low"}

If it's a card back / not a readable card, respond exactly: {"cardBack":true}
If you can see a card but can't read it clearly, set confidence to "low" and give your best guess.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!resp.ok) throw new Error(`API ${resp.status}: ${(await resp.text()).slice(0,150)}`);
    const data = await resp.json();
    const text = data.content?.[0]?.text || '';
    const result = JSON.parse((text.match(/\{[\s\S]*\}/) || ['{}'])[0]);
    return res.status(200).json(result);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
