# Chrome Extension Implementation Plan

## Architecture Overview

```
extension/
├── manifest.json                    # Manifest V3
├── popup/                           # Extension popup (React)
│   ├── index.html
│   ├── Popup.tsx                    # Main popup UI
│   ├── SetupView.tsx                # First-run: enter YNAB token + select budget/account
│   ├── ReviewView.tsx               # Review scraped orders, edit categories, confirm import
│   └── ResultView.tsx               # Post-import summary
├── options/                         # Full settings page
│   ├── index.html
│   └── Options.tsx                  # Manage YNAB credentials, category rules, AI key
├── content/                         # Content scripts
│   └── amazon-scraper.ts            # Runs on amazon.ca/amazon.com order pages, scrapes order data
├── background/
│   └── service-worker.ts            # Manifest V3 service worker: coordinates scraping, API calls
├── lib/                             # Shared logic (ported from existing TS)
│   ├── normalize.ts                 # CSV parsing, date/amount normalization (reuse lib/normalize.ts)
│   ├── categorize.ts                # Keyword categorization + AI categorization
│   ├── ynab-client.ts               # YNAB API wrapper (fetch-based, no SDK -- extensions can't use Node)
│   ├── duplicate-detection.ts       # Duplicate checking logic (port from api/import/route.ts)
│   └── types.ts                     # Shared types (CsvRow, YnabTransaction, etc.)
├── build/                           # Build output (gitignored)
└── build-tools/
    ├── webpack.config.js            # Bundle TS → extension JS
    ├── package.json                 # Dev dependencies (webpack, react, typescript)
    └── tsconfig.json
```

---

## Phases

### Phase 1: Scaffolding & Core Infrastructure
> Get a working extension that can be loaded in Chrome with a popup and settings page.

**1.1 — Manifest & Build System**
- Create `extension/manifest.json` (Manifest V3)
  - Permissions: `storage`, `activeTab`, `identity`
  - Host permissions: `https://api.ynab.com/*`, `https://api.anthropic.com/*`, `https://www.amazon.ca/*`, `https://www.amazon.com/*`
  - Content scripts: match `https://www.amazon.ca/gp/your-account/order-history*` and `.com` equivalent
  - Action: popup
  - Background: service worker
- Set up webpack config to bundle TypeScript + React into extension-compatible JS bundles
  - Entry points: popup, options, content script, service worker
  - Output: `extension/build/`
- Create `package.json` with dev dependencies: webpack, ts-loader, react, @types/chrome

**1.2 — Chrome Storage Layer**
- Create `lib/storage.ts` — wrapper around `chrome.storage.local`
  - `getSettings()` / `saveSettings()` for YNAB token, budget ID, account ID, Anthropic key
  - `getCategories()` / `saveCategories()` for cached YNAB category list
  - `getScrapedOrders()` / `saveScrapedOrders()` for pending orders awaiting review
  - All typed with TypeScript interfaces

**1.3 — Shared Types**
- Create `lib/types.ts`
  - Port `CsvRow` interface from existing `lib/normalize.ts`
  - Add: `ExtensionSettings`, `YnabCategory`, `ScrapedOrder`, `ImportResult`

### Phase 2: YNAB API Client (Browser-Compatible)
> Replace the Node.js `ynab` SDK with a fetch-based client that works in extension context.

**2.1 — YNAB REST Client**
- Create `lib/ynab-client.ts` — direct fetch calls to YNAB API v1
  - `fetchBudgets(token)` → list budgets (for setup)
  - `fetchAccounts(token, budgetId)` → list accounts (for setup)
  - `fetchCategories(token, budgetId)` → fetch category groups + categories
  - `fetchTransactions(token, budgetId, accountId, sinceDate)` → for duplicate detection
  - `createTransactions(token, budgetId, transactions[])` → bulk import
- All methods use `fetch()` with `Authorization: Bearer <token>` header
- Port the pagination logic from existing `api/import/route.ts` lines 69-93
- Port split transaction building from existing `api/import/route.ts` lines 107-178
- Error handling: surface YNAB error messages to user

**2.2 — Duplicate Detection Module**
- Create `lib/duplicate-detection.ts`
- Port `isDuplicate()` logic from existing `api/import/route.ts` lines 95-105
- Port the `existingByAmount` map-building from lines 68-93
- Configurable `DAYS_TOLERANCE` (default 5, stored in settings)

### Phase 3: Amazon Content Script (Page Scraping)
> Scrape order data directly from Amazon order history pages — eliminates the CSV export step entirely.

**3.1 — Content Script: DOM Scraper**
- Create `content/amazon-scraper.ts`
- Inject on Amazon order history pages (`/gp/your-account/order-history`)
- Scrape from the order cards on the page:
  - **Order date** — from the order header
  - **Order total** — from the order header
  - **Item names** — from each item line within the order card
  - **Item prices** — from each item's price element (when available; fall back to order total)
  - **Order ID** — from the order number link
- Handle pagination: detect "Next" button, optionally scrape multiple pages
- Communicate scraped data back to service worker via `chrome.runtime.sendMessage()`
- Add a floating action button / badge on the Amazon page: "Import X orders to YNAB"

**3.2 — Scraper Resilience**
- Use multiple CSS selector strategies (Amazon changes their DOM)
- Fallback: if DOM scraping fails, prompt user to use the existing Amazon Order History Reporter extension and upload CSV (graceful degradation)
- Log scraping errors to help debug when Amazon changes layout

**3.3 — CSV Upload Fallback**
- In the popup, add a "Upload CSV" option as an alternative to scraping
- Reuse existing `normalizeAmazonCsv()` from `lib/normalize.ts` (port directly — it's already TypeScript)
- This preserves compatibility with the Amazon Order History Reporter extension workflow

### Phase 4: Categorization Engine
> Port keyword-based categorization and add optional AI categorization.

**4.1 — Keyword Categorization**
- Create `lib/categorize.ts`
- Port `CATEGORY_KEYWORDS` and `categorize()` from existing `lib/normalize.ts` lines 4-62
- Make keyword lists configurable (stored in `chrome.storage`, editable in options page)
- Add "remember my corrections" — when user changes a category during review, store the mapping

**4.2 — AI Categorization (Optional)**
- Port `categorize_with_ai()` from `amazon_csv_to_ynab.py` lines 126-203
- Call Anthropic API directly from service worker using `fetch()`
  - User provides their own Anthropic API key in settings
  - No proxy server needed — the API key stays local in `chrome.storage`
- Port `_resolve_category()` fuzzy matching from lines 108-123
- Batch items (25 per request) to stay within token limits
- Port the prompt template from lines 146-182

### Phase 5: Popup UI (React)
> The main user interface — review orders, edit categories, confirm import.

**5.1 — Setup View** (shown on first run / when credentials missing)
- Enter YNAB Personal Access Token
- Token is validated immediately by calling `fetchBudgets()`
- Select budget from dropdown (populated from API)
- Select account from dropdown (populated from API)
- Optional: enter Anthropic API key for AI categorization
- Save to `chrome.storage.local`

**5.2 — Main / Review View** (primary workflow)
- Top section: status badge showing whether user is on an Amazon order page
- If on Amazon page: "Scrape Orders" button → triggers content script, shows loading
- If not on Amazon page: "Upload CSV" file input as fallback
- Order list: table/card view of scraped orders
  - Each row: date, item name (memo), amount, category dropdown
  - Category dropdown: populated from YNAB categories (cached)
  - Highlight "Uncategorized" rows in amber
  - Allow inline editing of any field
- Bottom: "Import to YNAB" button with count badge
- Show duplicate indicator for items that match existing YNAB transactions

**5.3 — Result View** (post-import)
- Summary: X imported, Y duplicates skipped, Z errors
- List of imported transactions with categories
- "Open YNAB" link to the budget

**5.4 — Styling**
- Dark theme matching existing web app aesthetic (slate/blue tones)
- Popup dimensions: 400px wide × 500px tall (Chrome popup constraint)
- Use CSS modules or Tailwind (bundled at build time)

### Phase 6: Options Page
> Full-page settings for power users.

**6.1 — Settings**
- YNAB credentials (token, budget, account) — same as setup, but editable
- Anthropic API key (optional)
- Duplicate detection tolerance (days slider, default 5)
- Default payee name (default "Amazon.ca")
- Amazon domain preference (amazon.ca vs amazon.com)

**6.2 — Category Rules**
- Editable keyword → category mapping table
- "Learned" mappings from user corrections (with delete option)
- "Sync categories from YNAB" button to refresh the category list

### Phase 7: Service Worker (Background)
> Coordinates all the pieces.

**7.1 — Message Router**
- Listen for messages from content script (scraped orders) and popup (user actions)
- Message types:
  - `SCRAPE_ORDERS` — trigger content script to scrape current page
  - `ORDERS_SCRAPED` — content script sends back scraped data
  - `CATEGORIZE` — run keyword + optional AI categorization on order list
  - `IMPORT` — execute YNAB import with duplicate detection
  - `FETCH_BUDGETS` / `FETCH_ACCOUNTS` — for setup flow

**7.2 — Badge Updates**
- Show order count on extension icon badge when on Amazon order page
- Clear badge after import

### Phase 8: Testing & Packaging

**8.1 — Manual Testing**
- Test with real Amazon order pages (amazon.ca and amazon.com)
- Test with various CSV formats from Amazon Order History Reporter
- Test YNAB import with split transactions
- Test duplicate detection across multiple imports
- Test with and without Anthropic API key

**8.2 — Package for Chrome Web Store**
- Build production bundle (minified)
- Create extension icons (16, 32, 48, 128px)
- Write Chrome Web Store listing copy
- Screenshots of workflow
- Privacy policy (required by Chrome Web Store)

---

## Code Reuse Map

| Existing File | What to Reuse | Port Strategy |
|---|---|---|
| `lib/normalize.ts` | `normalizeAmazonCsv()`, `parseCsv()`, `CsvRow`, date/amount parsing, keyword categorization | Direct copy with `csv-parse` replaced by lightweight browser CSV parser (Papa Parse) |
| `api/import/route.ts` | Duplicate detection, category ID mapping, split transaction grouping, YNAB transaction building | Port to `lib/ynab-client.ts` + `lib/duplicate-detection.ts`, replace `ynab` SDK with raw `fetch()` |
| `amazon_csv_to_ynab.py` | AI prompt template, `_resolve_category()` fuzzy matching, batch processing strategy | Port to `lib/categorize.ts` in TypeScript |
| `app/page.tsx` | UI layout patterns, step-by-step instructions, dark theme color palette | Reference for design; rewrite in popup-sized React components |

## What Gets Replaced (Not Reused)

| Component | Why |
|---|---|
| `ynab` npm package | Node.js SDK, doesn't work in extensions. Replace with raw `fetch()` calls to YNAB API. |
| `csv-parse` npm package | Node.js library. Replace with Papa Parse (browser-compatible). |
| `next` / Next.js framework | Not applicable to extensions. Replace with webpack + React. |
| `anthropic` Python package | Port to raw `fetch()` calls to Anthropic Messages API. |
| Server-side env vars | Replace with `chrome.storage.local` for credentials. |

---

## Key Technical Decisions

### 1. No Backend Server
The extension calls YNAB and Anthropic APIs directly. API keys stay in local storage, never leave the user's machine. This means:
- Zero hosting costs
- No auth infrastructure to build
- No server maintenance
- User manages their own API keys

Trade-off: Can't do freemium via server-side key management. But per the unit economics analysis, the niche market doesn't justify the infrastructure overhead. Users providing their own Anthropic key is the pragmatic path.

### 2. Manifest V3
Chrome's latest extension platform. Required for new Chrome Web Store submissions. Uses service workers instead of background pages.

### 3. Direct DOM Scraping vs. CSV-Only
Phase 3 adds direct scraping as the primary flow, with CSV upload as fallback. This is the key UX win — but Amazon DOM changes will require ongoing maintenance. The CSV fallback ensures the extension always works.

### 4. Papa Parse for CSV
Lightweight browser-compatible CSV parser. Replaces `csv-parse` (Node.js only). Handles BOM, flexible columns, quoted fields.

---

## Development Order & Dependencies

```
Phase 1 (Scaffolding)
  ↓
Phase 2 (YNAB Client)  ←──── can be tested independently
  ↓
Phase 3 (Amazon Scraper) ←── can be tested independently
  ↓
Phase 4 (Categorization) ←── depends on Phase 2 (needs category list)
  ↓
Phase 5 (Popup UI) ←──────── depends on all above
  ↓
Phase 6 (Options Page) ←──── depends on Phase 1 storage layer
  ↓
Phase 7 (Service Worker) ←── wires everything together
  ↓
Phase 8 (Testing & Ship)
```

Phases 2, 3, and 4 can be developed in parallel after Phase 1 is done.
