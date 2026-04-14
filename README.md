# LinkedIn Job Validator

> Chrome MV3 extension that scores LinkedIn job postings for validity across 8 weighted signals — company legitimacy, posting quality, apply hygiene, and fraud pattern detection.

Built by [The Faulkner Group](https://thefaulknergroupadvisors.com) as part of an Agentic AI Architect prototype series.

---

## What It Does

When you navigate to any `linkedin.com/jobs/*` posting, the extension injects a floating score badge (0–100) with a per-signal breakdown. A popup shows the same data from the browser toolbar icon.

### Scoring Architecture (100 pts)

| Category | Signals | Max Pts |
|---|---|---|
| **Company Legitimacy** | Verification badge, employee count, website linked | 30 |
| **Posting Quality** | Description depth, salary disclosed, qualifications, responsibilities | 35 |
| **Apply Process** | Domain match vs. redirect/shortener, LinkedIn Easy Apply | 20 |
| **Fraud Patterns** | 14 regex checks (MLM, upfront fees, guaranteed income, etc.) | 15 |

**Grade thresholds:** A (80+) · B (60–79) · C (40–59) · D (<40)

---

## File Structure

```
extension/          ← Load this folder in Chrome
  manifest.json     ← MV3 manifest
  scoring.js        ← Core scoring engine (also usable as a Node module)
  content.js        ← DOM scraper + overlay injector
  overlay.css       ← Floating badge styles
  popup.html        ← Toolbar popup UI
  background.js     ← Service worker (stores last result)
  icons/            ← 16 / 48 / 128px icons

demo/
  linkedin-job-validator-demo.html  ← Standalone browser demo (no extension needed)
```

---

## Install (Dev Mode)

1. Clone this repo
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `extension/` folder
5. Navigate to any `linkedin.com/jobs/` posting

---

## Demo

Open `demo/linkedin-job-validator-demo.html` directly in any browser. Includes 4 presets:

- ✅ Legitimate Posting
- ⚠️ Suspicious Posting
- 👻 Ghost Job
- 🚨 Clear Scam

---

## Known Gaps & Roadmap

| Gap | Next Step |
|---|---|
| LinkedIn DOM changes break selectors | Versioned selector map + mutation-observer fallback |
| No external URL/domain validation | FastAPI backend: WHOIS age check, redirect resolution |
| Ghost job detection needs posting age history | LinkedIn scrape history or third-party API |
| Company verification SVG scraping is fragile | User-reported toggle signal in popup |

---

## Architecture Notes

- **`scoring.js`** is framework-agnostic — can be imported as a Node module for server-side scoring
- **No external API calls** from the extension itself — all scoring is local
- **MV3 compliant** — uses service worker, no background page, declarative net request
- HIPAA/PHI: no job description content is transmitted anywhere

---

## License

MIT — The Faulkner Group
