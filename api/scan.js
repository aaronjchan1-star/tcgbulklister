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
- "yugioh" — Yu-Gi-Oh! Distinctive look: tan/brown Monster cards or coloured Spell/Trap cards, a row of Level STARS near the top, and ATK / DEF numbers along the bottom edge. Collector code is SET-LANGUAGE+digits in a bottom corner, e.g. LOCR-JP001, POTE-EN001, RA04-EN001 — the language code is EN, JP, KR, AE, etc. ALWAYS include that language code in the number.
- "gundam" — Gundam Card Game (Bandai). Mobile suits / anime mecha & pilots from Gundam; coloured border (Blue/Green/Red/White/Purple); AP / HP stats on Unit cards; a rarity letter (C/U/R/LR) by the number. Collector numbers: GD01-068, GD02-001, ST01-001, EB01-001 (set GD01–GD05, ST##). If you see Gundam mobile suits / mecha, it is "gundam", NOT One Piece.

Disambiguation by ARTWORK and LAYOUT (do this carefully — these games look very different):
- Yu-Gi-Oh has Level stars + ATK/DEF stats and a tan monster frame. One Piece has NO ATK/DEF and NO level stars; it has DON!!/Life/Power values and a coloured pirate-themed border. If you see ATK/DEF and Level stars, it is Yu-Gi-Oh, NOT One Piece.
- One Piece = anime pirates; Gundam = mecha / mobile suits. ST## and EB## numbers are used by BOTH One Piece and Gundam — decide by the artwork (pirates vs mobile suits), not the number.

STEP 0 — Is this the FRONT of a single trading card? If you see a card BACK (the patterned reverse — e.g. the blue/brown Pokémon back, the brown Yu-Gi-Oh back, the One Piece back), or there is no card, or the image is too blurry to read, set "cardBack" to true and stop — do not guess a card.

STEP 2 — Read the collector number EXACTLY as printed (usually a bottom corner). This is the MOST important field — read it character by character. Do not guess or autocomplete to a number you think exists. For One Piece, the set prefix is OP01–OP16, EB01–EB04, ST, or PRB — there is no OP17/OP18/OP19 yet, so if you think you see a higher number, look again carefully (a 6 can look like an 8 or 9 when blurry). If the number is blurry or you are not fully sure of any digit, set confidence to "low".

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
{"cardBack":false,"game":"onePiece|pokemon|yugioh|gundam","number":"exact collector number","name":"card name","variant":"Normal|Holo|Reverse Holo|Poke Ball|Master Ball|Alt Art|unknown","confidence":"high|medium|low"}

If it's a card back / not a readable card, respond exactly: {"cardBack":true}
If you can see a card but can't read it clearly, set confidence to "low" and give your best guess.`;

  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
        { type: 'text', text: prompt }
      ]
    }]
  });

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Retry transient Anthropic errors (rate limit / overloaded / gateway) — these
  // are common when slinging cards quickly and were surfacing as raw 500s.
  const RETRYABLE = new Set([429, 500, 502, 503, 529]);
  let lastErr = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body
      });

      if (!resp.ok) {
        const errText = (await resp.text()).slice(0, 200);
        lastErr = `Anthropic ${resp.status}: ${errText}`;
        if (RETRYABLE.has(resp.status)) {
          if (attempt < 3) { await sleep(400 * Math.pow(2, attempt) + Math.random() * 200); continue; }
          // Exhausted retries on a transient error — user can just re-feed the card
          return res.status(200).json({ scanError: true, retryable: true, message: lastErr, confidence: 'low' });
        }
        // Non-retryable (e.g. 400 bad image, 401 bad key) — skip, don't crash
        return res.status(200).json({ scanError: true, retryable: false, message: lastErr, confidence: 'low' });
      }

      const data = await resp.json();
      const text = data.content?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        // Model didn't return JSON — treat as an unreadable card, don't 500
        return res.status(200).json({ scanError: true, retryable: true, message: 'No JSON in model response', confidence: 'low' });
      }
      try {
        return res.status(200).json(JSON.parse(match[0]));
      } catch {
        return res.status(200).json({ scanError: true, retryable: true, message: 'Malformed JSON', confidence: 'low' });
      }
    } catch (e) {
      // Network/timeout — retry a couple of times
      lastErr = e.message || String(e);
      if (attempt < 3) { await sleep(400 * Math.pow(2, attempt)); continue; }
    }
  }
  // All attempts exhausted — return a soft error so the client can flag & continue
  return res.status(200).json({ scanError: true, retryable: true, message: lastErr || 'Scan failed after retries', confidence: 'low' });
}
