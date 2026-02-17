# Form Factor Analysis: YNAB Automation

## Current State

The app automates importing Amazon purchases into YNAB with AI-powered categorization. Today it ships as:

- **CLI** (Python) -- full-featured, power-user oriented
- **Web app** (Next.js on Vercel) -- simplified browser UI, no AI categorization
- **Depends on a 3rd-party Chrome extension** ("Amazon Order History Reporter") just to get the source CSV

The core user workflow is: **scrape Amazon orders -> convert CSV -> categorize -> import to YNAB**. That's 3 tools and multiple manual handoffs today.

---

## Form Factor Options

### 1. Chrome Extension (Recommended)

**What it looks like:** A single extension that scrapes Amazon order history directly, categorizes items, and pushes them to YNAB -- all from the browser toolbar.

| Dimension | Assessment |
|-----------|------------|
| **UX** | Eliminates the entire multi-tool workflow. User clicks one button on Amazon, reviews categorized transactions, confirms import. Goes from a ~10-step process to 2-3 clicks. |
| **Technical fit** | The app *already requires* a Chrome extension for data extraction. Consolidating scraping + conversion + import into one extension removes the weakest link (manual CSV export/import). Chrome extensions can make API calls to both YNAB and Anthropic directly. |
| **Monetization** | Chrome Web Store supports paid extensions and freemium models. Natural tier structure: free (manual categories) vs. paid/subscription (AI categorization). One-time purchase ($5-10) or small monthly ($2-3/mo) both viable. Payment friction is low -- users already trust the Chrome Web Store. |
| **Distribution** | Chrome Web Store provides built-in discovery, reviews, and install infrastructure. YNAB community forums and Reddit (r/ynab) are highly engaged and would organically spread a good extension. |
| **Limitations** | Locked to Chromium browsers (Chrome, Edge, Brave, Arc -- ~77% of desktop browser market). Extension review process adds release friction. Amazon may change their DOM, requiring maintenance. |

**Verdict: Best option.** The dependency on browser-based Amazon scraping makes this the natural home. Collapsing 3 tools into 1 is a massive UX win.

---

### 2. Web App (Current -- Good as Secondary)

**What it looks like:** The existing Vercel-hosted Next.js app, potentially enhanced with user accounts and YNAB OAuth.

| Dimension | Assessment |
|-----------|------------|
| **UX** | Decent but fundamentally limited. Users must still manually export CSV from the Amazon extension, then upload it. This two-step handoff is the core friction point and a web app can't eliminate it (browsers can't scrape other sites). |
| **Technical fit** | Already built and deployed. Could be enhanced with YNAB OAuth (vs. manual token entry), AI categorization, and user accounts. Serverless architecture scales well. |
| **Monetization** | Requires building auth/billing infrastructure (Stripe, user accounts, etc.). SaaS model ($3-5/mo) is natural but the overhead of auth + billing may not justify it for a niche tool. Hard to charge for a tool that still requires manual CSV wrangling. |
| **Distribution** | No app store discovery. Relies entirely on SEO, Reddit posts, and YNAB community word-of-mouth. |
| **Limitations** | Cannot scrape Amazon directly. Always requires the manual CSV export step. Users must trust a web app with their YNAB token (or build full OAuth). |

**Verdict: Keep as a free companion/landing page, but not the primary product.**

---

### 3. Mobile App (iOS/Android)

**What it looks like:** Native or React Native app for importing Amazon orders into YNAB on the go.

| Dimension | Assessment |
|-----------|------------|
| **UX** | Poor fit. Amazon order scraping is a desktop activity. Mobile Amazon doesn't expose order history in a scrapeable way. Users would still need to get CSV data from desktop, then... open their phone? The workflow doesn't match mobile usage patterns. |
| **Technical fit** | YNAB already has a well-regarded mobile app. Building a separate mobile app to feed data into YNAB duplicates existing mobile infrastructure without solving the core data extraction problem. |
| **Monetization** | App stores take 15-30% cut. Review process is strict. Building for both iOS and Android doubles effort. The addressable market (YNAB users who shop on Amazon and want automation) is too niche for mobile app store discovery. |
| **Distribution** | App store search for "YNAB" is dominated by YNAB's own app. Discoverability would be extremely low. |
| **Limitations** | Doesn't solve the data extraction problem. High development and maintenance cost. Platform fees eat into margins. |

**Verdict: Not recommended. The workflow is fundamentally desktop-oriented.**

---

### 4. Desktop App (Electron/Tauri)

**What it looks like:** Standalone desktop application that runs locally, handles scraping, conversion, and import.

| Dimension | Assessment |
|-----------|------------|
| **UX** | Could provide a polished native experience with system tray integration, scheduled imports, etc. But it's a heavy install for a tool most people use once a month. |
| **Technical fit** | Could embed a browser engine for scraping (Playwright/Puppeteer), removing the extension dependency. But this adds significant complexity and is fragile against Amazon's anti-bot measures. |
| **Monetization** | Direct sales ($10-20 one-time) via Gumroad or similar. No platform fees if distributed outside app stores. But desktop apps have higher support burden (OS compatibility, updates, crashes). |
| **Distribution** | No app store discovery (unless Mac App Store). Harder to build trust -- users must download and run an executable. |
| **Limitations** | High development cost (cross-platform compatibility). Auto-update infrastructure needed. Much heavier than necessary for this use case. |

**Verdict: Over-engineered for the problem. A Chrome extension does everything a desktop app would, with less friction.**

---

### 5. YNAB Native Integration / API-Only Service

**What it looks like:** A background service that connects to Amazon (via saved credentials or email forwarding) and automatically imports to YNAB.

| Dimension | Assessment |
|-----------|------------|
| **UX** | The dream: fully automatic, zero interaction. But Amazon has no official order API, so this requires storing Amazon credentials (security nightmare) or parsing order confirmation emails (fragile). |
| **Technical fit** | Email parsing is achievable but brittle. Amazon credential storage is a liability. YNAB doesn't support third-party integrations in their app marketplace. |
| **Monetization** | SaaS subscription ($3-5/mo) is natural for "set it and forget it" services. But the security and reliability concerns would limit adoption. |
| **Distribution** | Hard to market a service that asks for Amazon credentials. Trust barrier is very high. |
| **Limitations** | No official Amazon API for order history. High security/liability risk. Fragile to Amazon's frequent UI/email format changes. |

**Verdict: Aspirational but impractical without an official Amazon order API.**

---

## Recommendation

### Primary: Chrome Extension

Build a Chrome extension that:

1. **Detects when user is on Amazon order history** and offers to scrape
2. **Converts and categorizes** using the existing logic (keyword-based free tier, AI-powered paid tier)
3. **Imports directly to YNAB** via their API with duplicate detection
4. **Shows a review screen** before import so users can adjust categories

**Monetization model:**
- **Free tier:** Manual categorization, basic import, up to 50 transactions/month
- **Pro tier ($2-3/month or $20/year):** AI-powered categorization, unlimited transactions, split transaction support, category learning/customization

**Why this wins:**
- Eliminates the #1 UX pain point (multi-tool CSV handoff)
- Natural fit -- the app already lives in the browser
- Chrome Web Store provides distribution and trust
- Low barrier to try (free tier), clear upgrade path (AI features)
- ~77% desktop browser market share covered by Chromium
- Relatively low development cost (much of the logic already exists)

### Secondary: Keep the Web App

Maintain the existing web app as:
- A **landing page** that explains the extension and links to Chrome Web Store
- A **fallback tool** for non-Chrome users who still want manual CSV conversion
- A **free, no-install option** for users who aren't ready to install an extension

---

## Development Priority

1. **Phase 1:** Chrome extension with manual CSV-based flow (repackage existing web logic)
2. **Phase 2:** Add direct Amazon page scraping (eliminate CSV step entirely)
3. **Phase 3:** Add AI categorization as paid feature (Anthropic API calls from extension)
4. **Phase 4:** Add YNAB OAuth flow (vs. manual token entry)
5. **Phase 5:** Category learning -- remember user corrections and apply to future imports
