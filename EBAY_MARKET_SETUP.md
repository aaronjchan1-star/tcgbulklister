# eBay Market Check Setup (one-time)

This lets the app compare your prices against **live eBay AU listings** using eBay's Browse API.

## What you need
You already have an eBay **App ID** (Client ID). You also need your **Cert ID** (Client Secret).

## Steps
1. Go to https://developer.ebay.com → sign in → **Application Keys**
2. Under your **Production** keyset, copy:
   - **App ID (Client ID)**
   - **Cert ID (Client Secret)**
3. In Vercel → your project → **Settings → Environment Variables**, add:
   - `EBAY_APP_ID`  = your App ID
   - `EBAY_CERT_ID` = your Cert ID
4. Redeploy (Vercel → Deployments → ⋯ → Redeploy)

## How it works
- Click **"Check my prices against eBay market"** in the listings section
- For each priced card it pulls current AU active listings, takes a trimmed median, and estimates the sold price (median × 0.85)
- An indicator appears next to each price: 🟢 In range · 🟠 Above market · 🔵 Below market

## Important limitation
This uses **active listings** (current asking prices), not confirmed sold prices. eBay's true sold-data API (Marketplace Insights) is restricted to approved enterprise partners and isn't available to most individual sellers. Active asking prices run a bit above what cards actually sell for, which is why the tool applies a 0.85 factor to estimate sold value. Treat it as a strong sanity check, not gospel — for high-value cards, still glance at the eBay sold-search link.
