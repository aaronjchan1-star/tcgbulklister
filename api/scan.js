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

STEP 2 — Read the collector number EXACTLY as printed (usually a bottom corner).

For the card name, read the title printed on the card.

For variant/finish, look for visual cues:
- Pokémon: is it Holo (shiny foil on the artwork), Reverse Holo (foil on everything except artwork), or Normal (no foil)? If you see a special pattern (Poké Ball or Master Ball symbols repeated in the foil), note "Poke Ball" or "Master Ball".
- For other games, note if it's an alternate art or special rarity if obvious.

Respond ONLY with JSON, no other text:
{"game":"onePiece|pokemon|yugioh|riftbound","number":"exact collector number","name":"card name","variant":"Normal|Holo|Reverse Holo|Poke Ball|Master Ball|Alt Art|unknown","confidence":"high|medium|low"}

If you cannot read the card clearly, set confidence to "low" and provide your best guess.`;

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
