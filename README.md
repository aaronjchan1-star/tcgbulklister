# One Piece TCG — eBay AU Bulk Lister

A lightweight, browser-based tool for bulk listing One Piece TCG Super Rare (SR) cards on eBay Australia. No backend, no dependencies — just open `index.html` or host on GitHub Pages.

## Features

- Search by card number (e.g. `OP01-001`, `OP15-060`)
- Auto-fetch last sold price from eBay AU using the eBay Finding API
- Median price across recent sold listings to avoid outlier skew
- Supports OP01–OP15 and ST01–ST19
- English and Japanese card support
- Exports a valid eBay File Exchange CSV ready for Seller Hub bulk upload
- API key saved locally in your browser (never sent anywhere except eBay)

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/onepiece-ebay-lister.git
cd onepiece-ebay-lister
```

### 2. Open locally

Just open `index.html` in your browser — no build step needed.

Or serve it with any static server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

### 3. Get an eBay API key

1. Go to [developer.ebay.com](https://developer.ebay.com)
2. Sign in with your eBay account
3. Go to **My Account → Application Keys**
4. Copy your **Production App ID (Client ID)**
5. Paste it into the tool — it's saved in your browser's localStorage

> The App ID is used only to call eBay's public Finding API. It is never sent to any third-party server.

## Hosting on GitHub Pages

1. Push the repo to GitHub
2. Go to **Settings → Pages**
3. Set source to `main` branch, root folder
4. Your tool will be live at `https://YOUR_USERNAME.github.io/onepiece-ebay-lister`

## Uploading to eBay

1. Add your cards and download the CSV
2. Log in to [eBay Seller Hub](https://www.ebay.com.au/sh/lst)
3. Go to **Listings → Bulk listing upload → File Exchange**
4. Upload the CSV
5. Review listings and add photos manually in Seller Hub (CSV doesn't carry images)

## Notes

- eBay title limit is 80 characters — titles are automatically trimmed
- The Finding API returns AUD prices when `Currency=AUD` is set, but double-check if your eBay account is set to AU
- Combined postage: the description template mentions this by default — adjust in `js/csv.js` if needed
- Returns are set to **not accepted** by default — change `ReturnsNotAccepted` to `ReturnsAccepted` in `js/csv.js` if preferred

## File structure

```
onepiece-ebay-lister/
├── index.html        # Main UI
├── css/
│   └── style.css     # All styles
├── js/
│   ├── api.js        # eBay API key + Finding API lookup
│   ├── listings.js   # Listings state + table render
│   ├── csv.js        # CSV generation + download
│   └── ui.js         # Small UI helpers
└── README.md
```

## License

MIT
