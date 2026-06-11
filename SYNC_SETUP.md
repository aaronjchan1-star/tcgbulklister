# Cross-Device Sync Setup (one-time, free)

Sync lets you scan cards on your phone and export the CSV on your computer using a shared code.

## Step 1 — Create a free Redis database

**Option A — Vercel KV (easiest):**
1. In your Vercel project → **Storage** tab → **Create Database** → **KV** (Upstash Redis)
2. Connect it to your project — Vercel auto-adds the env vars `KV_REST_API_URL` and `KV_REST_API_TOKEN`

**Option B — Upstash directly:**
1. Sign up at https://console.upstash.com (free)
2. Create a Redis database
3. Copy the **REST URL** and **REST TOKEN**
4. In Vercel → your project → **Settings → Environment Variables**, add:
   - `KV_REST_API_URL` = your REST URL
   - `KV_REST_API_TOKEN` = your REST token

## Step 2 — Redeploy

After adding the env vars, redeploy (Vercel → Deployments → ⋯ → Redeploy) so they take effect.

## Step 3 — Use it

1. On your computer, click the **🔄 Set up sync** pill → **Generate new code** → Save
2. On your phone, open the same site, click the sync pill, enter that code → Save
3. Now both devices share the same list. Scanning on mobile pushes automatically; pull on desktop to see the cards.

## Notes
- Free tier easily handles thousands of listings. Payloads are capped at ~1MB and expire after 30 days of no use.
- If env vars aren't set, the app still works fully — just without cross-device sync (local-only).
- The sync code is the only key, so treat it like a password. Anyone with the code can see/edit that list.
