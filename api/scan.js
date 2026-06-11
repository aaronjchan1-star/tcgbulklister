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

Identify which trading card game it is:
- "onePiece" — One Piece Card Game. Collector numbers look like OP07-026, EB01-012, ST01-001, PRB01-001
- "pokemon" — Pokémon TCG. Collector numbers look like 025/198, 6/102, 199/091 (number/setTotal)
- "yugioh" — Yu-Gi-Oh! Collector numbers look like LOCR-JP001, POTE-EN001, RA01-EN001 (SET-LANG###)
- "riftbound" — Riftbound (League of Legends). Numbers look like OGN-001, UNL-053, SFD-001

The collector number is usually in a bottom corner of the card. Read it EXACTLY as printed.

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
