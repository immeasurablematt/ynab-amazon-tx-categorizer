# SaaS Conversion: ynab-automation → Amazon-to-YNAB SaaS (v2)

## Context

Convert the single-user Next.js app at `~/.openclaw/workspace/repos/ynab-automation/` into a multi-tenant SaaS. Currently: zero auth, zero database, YNAB credentials hardcoded in env vars, Chrome extension with its own Personal Access Token flow. Target: multi-user YNAB OAuth, Stripe subscriptions, marketing landing page.

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Auth | NextAuth v5 (Auth.js) | Free, custom YNAB OAuth provider, App Router native |
| DB | Neon Postgres | Vercel-native, serverless HTTP driver, free tier |
| ORM | Drizzle | No cold-start penalty (vs Prisma's 15MB engine), great TS |
| Billing | Stripe (API-managed trials + Embedded Checkout for conversion) | Trial without card upfront; Embedded Checkout when trial ends |
| CSS | Tailwind | Standard for Next.js. New pages only — existing inline styles left as-is until dashboard rewrite |
| Sessions | Database sessions (not JWT) | Server-side access to refresh tokens required for YNAB token rotation |
| React | Upgrade to React 19 | NextAuth v5 + Next.js 15 Server Components work best with React 19; do this in Phase 1 alongside deps |

**New runtime deps (6):** `next-auth@beta`, `@auth/drizzle-adapter`, `drizzle-orm`, `@neondatabase/serverless`, `stripe`, `@upstash/ratelimit`
**New dev deps (1):** `drizzle-kit`
**Upgraded:** `react@19`, `react-dom@19`, `@types/react@19`, `@types/react-dom@19`

---

## YNAB OAuth Specifics (from API docs)

- Authorization Code Grant (server-side) — NOT Implicit Grant
- Auth URL: `https://app.ynab.com/oauth/authorize?client_id=X&redirect_uri=Y&response_type=code`
- Token URL: `https://app.ynab.com/oauth/token` (POST with `grant_type=authorization_code`)
- DO NOT pass `scope` — default scope gives read+write, which we need for creating transactions
- Tokens expire in 2 hours — refresh is critical
- **Refresh tokens are single-use** — each refresh issues a new refresh token; must update DB atomically
- 200 requests/hour per access token — rate limit awareness needed
- **25-user cap on new OAuth apps (Restricted Mode)** — must request production review (2-4 week turnaround)
- Userinfo: `GET https://api.ynab.com/v1/user` → `{ data: { user: { id: "uuid" } } }`
- **No email returned from YNAB API** — user ID is the only identifier

---

## Architecture

### Auth: YNAB OAuth = sign-in + YNAB connection in one step

No email/password. Everyone using this tool has YNAB. One "Connect with YNAB" button creates the account AND captures the API token.

```ts
// auth.ts — YNAB as custom NextAuth provider
const YNABProvider = {
  id: "ynab",
  name: "YNAB",
  type: "oauth",
  authorization: {
    url: "https://app.ynab.com/oauth/authorize",
    params: { response_type: "code" },  // NO scope param = full access
  },
  token: "https://app.ynab.com/oauth/token",
  userinfo: { url: "https://api.ynab.com/v1/user" },
  profile(profile) {
    return { id: profile.data.user.id, name: `YNAB User ${profile.data.user.id.slice(0,8)}` }
  },
}
```

**Session strategy: database** (not JWT) — required because we need server-side access to refresh tokens stored in the `accounts` table.

### Email Collection (resolves #1 — Stripe needs email, YNAB doesn't provide one)

Post-OAuth, before any other action, users hit `/dashboard/setup` which:
1. Prompts for email (required — for Stripe receipts, account recovery, comms)
2. Lets them pick YNAB budget + account
3. Saves email to `users.email`, creates `ynab_connections` row

Stripe Customer is created with this email. No Stripe interaction happens until email is collected.

### Token Refresh with Mutex (resolves #7 — race condition)

```ts
// lib/ynab-token.ts
// Uses Postgres advisory lock to prevent concurrent refresh of single-use tokens
//
// 1. Check accounts.expires_at
// 2. If not expired: return access_token
// 3. If expired:
//    a. SELECT pg_advisory_xact_lock(hashtext(user_id))  -- serializes per-user
//    b. Re-read accounts row (another request may have already refreshed)
//    c. If still expired: POST to YNAB token URL with grant_type=refresh_token
//    d. UPDATE accounts SET access_token=new, refresh_token=new, expires_at=new
//    e. Return new access_token
// 4. On 401 from YNAB API: retry refresh once, then fail with "re-auth required"
```

The advisory lock is scoped to a transaction and auto-releases. No stale locks possible.

### Database Schema

```sql
-- NextAuth managed (via DrizzleAdapter)
users (id, name, email, emailVerified, image)
accounts (id, userId, type, provider, providerAccountId,
          access_token, refresh_token, expires_at, token_version, ...)
sessions (id, sessionToken, userId, expires)

-- App tables
ynab_connections (
  id            uuid PK,
  user_id       text NOT NULL REFERENCES users(id),
  budget_id     text NOT NULL,
  budget_name   text NOT NULL,
  account_id    text NOT NULL,
  account_name  text NOT NULL,
  duplicate_days_tolerance  int NOT NULL DEFAULT 5,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(user_id, budget_id, account_id)
)

subscriptions (
  id                      uuid PK,
  user_id                 text NOT NULL REFERENCES users(id),
  stripe_customer_id      text UNIQUE NOT NULL,
  stripe_subscription_id  text UNIQUE,
  status                  text NOT NULL,  -- trialing|active|canceled|past_due
  current_period_end      timestamptz,
  created_at              timestamptz DEFAULT now()
)

import_history (
  id              uuid PK,
  user_id         text NOT NULL REFERENCES users(id),
  connection_id   uuid REFERENCES ynab_connections(id),
  imported_count  int NOT NULL DEFAULT 0,
  skipped_count   int NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now()
)
```

Note: `duplicate_days_tolerance` moved from env var to per-connection setting (resolves #10). `token_version` on accounts enables optimistic concurrency as a fallback check.

### Page Structure

```
PUBLIC:
/                          → Marketing landing page
/pricing                   → Pricing page
/auth/signin               → "Connect with YNAB" button

PROTECTED (auth required):
/dashboard/setup           → Email + Budget/account selector (post-OAuth, before paywall)

PROTECTED (auth + active subscription OR trial):
/dashboard                 → Main dashboard
/dashboard/import          → CSV upload + import (moved from current /)
/dashboard/history         → Past imports table
/dashboard/billing         → Subscription status → Stripe Portal link

API ROUTES:
/api/auth/[...nextauth]    → NextAuth handlers
/api/import                → PROTECTED: per-user YNAB creds from DB
/api/normalize             → PUBLIC: stateless CSV transform (unchanged)
/api/categorize            → PUBLIC: stateless AI proxy (unchanged — Chrome extension depends on this)
/api/stripe/webhook        → Stripe signature verification only
```

### Middleware Configuration (resolves #11 — CORS for extension)

```ts
// middleware.ts
export const config = {
  matcher: [
    // Protect dashboard routes and import API
    "/dashboard/:path*",
    "/api/import",
    // EXPLICITLY EXCLUDED (must not match):
    // /api/categorize  — Chrome extension depends on public access
    // /api/normalize   — stateless, no auth needed
    // /api/auth        — NextAuth handles its own auth
    // /api/stripe      — webhook has its own signature verification
  ],
};
```

The `/api/categorize` and `/api/normalize` routes are NOT matched by middleware, so no CORS preflight issues for the extension.

### Stripe: No-Card Trial + Embedded Checkout at Conversion (resolves #13)

The original plan had `trial_period_days: 14` on Embedded Checkout, which **collects a credit card upfront** — contradicting "no credit card required."

**Revised flow:**

1. **Sign up** → user gets 14-day trial tracked in `subscriptions` table (no Stripe interaction yet)
2. **During trial** → `status: 'trialing'`, `current_period_end` = signup + 14 days. Full access.
3. **Trial expiring (3 days before)** → banner: "Trial ends in 3 days. Add payment to continue."
4. **Trial expired** → paywall. "Start subscription" button opens Embedded Checkout (NOW collects card).
5. **Post-checkout** → Stripe webhook sets `status: 'active'`

```ts
// actions/stripe.ts — only called when user is ready to pay
"use server"
export async function createCheckoutSession() {
  const session = await auth();
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, session.user.id),
  });
  const checkout = await stripe.checkout.sessions.create({
    ui_mode: "embedded",
    mode: "subscription",
    customer: sub.stripeCustomerId,  // pre-created with user's email
    line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    return_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
  });
  return { clientSecret: checkout.client_secret };
}
```

Webhook events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

### Key Change: /api/import/route.ts

```ts
// Before (single-tenant):
const token = process.env.YNAB_ACCESS_TOKEN;
const budgetId = process.env.YNAB_BUDGET_ID;
const accountId = process.env.YNAB_ACCOUNT_ID;
const DAYS_TOLERANCE = parseInt(process.env.YNAB_DUPLICATE_DAYS || "5", 10);

// After (multi-tenant):
const session = await auth();
if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const connection = await db.query.ynabConnections.findFirst({
  where: eq(ynabConnections.userId, session.user.id),
});
if (!connection) return NextResponse.json({ error: "Complete setup first" }, { status: 400 });

const token = await getYnabToken(session.user.id);  // handles 2-hour expiry + mutex refresh
const { budgetId, accountId, duplicateDaysTolerance: DAYS_TOLERANCE } = connection;

// IMPORTANT: create a fresh ynab.API(token) instance per-request — never reuse stale clients (#8)
const api = new ynab.API(token);
```

Everything after the setup block stays identical — CSV parsing, dedup, category matching, transaction creation.

---

## Chrome Extension Strategy (resolves #3 — extension ignored in original plan)

The extension currently uses its own YNAB Personal Access Token entered in the options page. It talks directly to the YNAB API (no web app involvement except for `/api/categorize`).

**Decision: leave the extension on Personal Access Tokens for now.**

Rationale:
- The extension's auth flow is completely independent — it stores tokens in `chrome.storage`
- Converting the extension to OAuth would require a second OAuth redirect URI, token management in the service worker, and Chrome identity API integration — a full rewrite
- The extension already works well with PATs; this is how most YNAB integrations work
- The SaaS conversion is about the web app, not the extension

**What changes for the extension:**
- Nothing breaks. `/api/categorize` stays public (with rate limiting — see below)
- `/api/normalize` stays public
- `extension/lib/normalize.ts` is a separate copy (ported to use Papa Parse), not a symlink to `lib/normalize.ts` — no coupling risk (#14)
- If we later want extension users to auth via the web app, that's a future phase

---

## Rate Limiting /api/categorize (resolves #4 — open AI proxy)

**This is Phase 1, not Phase 5.** The endpoint is an unauthenticated proxy to the Anthropic API burning real money.

```ts
// app/api/categorize/route.ts — add at top
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, "1 h"),  // 20 requests/hour per IP
  prefix: "rl:categorize",
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }
  // ... existing logic
}
```

Requires: Upstash Redis (free tier: 10K requests/day). Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to env.

---

## Tailwind Strategy (resolves #6 — bigger migration than implied)

**Do NOT rewrite existing inline-styled components to Tailwind.** The current `page.tsx` and extension all use inline `style={{}}`. Rewriting them is unnecessary churn.

- **Phase 1-3**: New dashboard pages use Tailwind. Existing import UI moved as-is (inline styles intact) to `/dashboard/import/page.tsx`.
- **Phase 4**: Landing page, pricing page, and sign-in page written in Tailwind from scratch.
- **Never**: Don't go back and convert old inline styles unless there's a reason. They work fine.

This means `globals.css` keeps its 13 lines + Tailwind directives are added. Both coexist.

---

## Landing Page Structure

1. Nav: Logo + Login + "Start Free Trial" CTA
2. Hero: "Stop Manually Entering Amazon Purchases in YNAB" / "AI-powered categorization saves you 30+ minutes every week"
3. Problem: 3 pain-point cards (manual entry, mystery transactions, wrong categories)
4. Solution: 3 benefit cards (automatic import, AI categorization, split transactions)
5. How It Works: 3 steps (Export from Amazon → Connect YNAB → Import with AI)
6. Pricing: Single plan, monthly price, **14-day free trial, no credit card required** (genuinely no card)
7. Security: Encryption details, YNAB OAuth (no password storage), data handling
8. FAQ: 6 collapsible questions
9. Final CTA: "Start your free 14-day trial"
10. Footer: Links, **privacy policy**, **terms of service**

---

## Implementation Phases

### Phase 0: Pre-Reqs — Before Writing Code (~1 session)

**This phase is blocking. Do it first.**

1. **Register YNAB OAuth app** at `app.ynab.com/oauth/applications`
   - Set redirect URI for both production (`https://ynab-automation.vercel.app/api/auth/callback/ynab`) AND preview (`https://*.vercel.app/api/auth/callback/ynab` — YNAB requires exact match, so register both or use a single production URL initially)
   - **Request production review immediately** — 2-4 week wait. Include a brief description of the product. You can iterate on code while waiting.
   - **Mitigation if rejected or delayed:** ship with 25-user cap. Use a waitlist on the landing page. The product still works for early adopters. Re-apply with user testimonials.
2. **Create Neon Postgres** via Vercel Marketplace (auto-sets `DATABASE_URL`)
3. **Create Upstash Redis** via Vercel Marketplace (auto-sets `UPSTASH_REDIS_REST_URL` + token)
4. **Create Stripe account** — product + price ($4.99/month or whatever)
5. **Draft privacy policy + terms of service** (resolves #12). Required before YNAB production review and before handling financial data. Can be simple/templated but must exist. Cover: what data you store (YNAB user ID, budget/account IDs, import history), what you don't store (transaction details, Amazon order contents), data deletion on account closure.
6. **Set up preview branch strategy** (resolves #9): all SaaS work happens on a `saas` branch. Production (`main`) continues serving the current single-tenant app until Phase 2 is verified on preview URLs. Cutover is a merge to `main`.

### Phase 1: Foundation — Auth + DB + Rate Limiting (~3 sessions)

Files created: `auth.ts`, `db/schema.ts`, `db/index.ts`, `lib/ynab-token.ts`, `middleware.ts`, `app/api/auth/[...nextauth]/route.ts`, `drizzle.config.ts`
Files modified: `package.json` (deps + React 19 upgrade), `app/api/categorize/route.ts` (rate limiting)

1. Create `saas` branch from `main`
2. Upgrade React: `npm install react@19 react-dom@19 @types/react@19 @types/react-dom@19`
3. `npm install next-auth@beta @auth/drizzle-adapter drizzle-orm @neondatabase/serverless stripe @upstash/ratelimit @upstash/redis`
4. `npm install -D drizzle-kit`
5. Write `db/schema.ts` — Drizzle table definitions (users, accounts, sessions, ynab_connections, subscriptions, import_history). Include `duplicateDaysTolerance` on ynab_connections, `tokenVersion` on accounts.
6. Write `db/index.ts` — Neon serverless client + Drizzle instance
7. Write `drizzle.config.ts` → `npx drizzle-kit push`
8. Write `auth.ts` — YNAB custom OAuth provider + DrizzleAdapter + **database session strategy**
9. Write `app/api/auth/[...nextauth]/route.ts`
10. Write `lib/ynab-token.ts` — token refresh with `pg_advisory_xact_lock` mutex + optimistic version check fallback
11. Write `middleware.ts` — protect `/dashboard/*` and `/api/import` ONLY. Explicitly do not match `/api/categorize`, `/api/normalize`, `/api/auth`, `/api/stripe`
12. **Add rate limiting to `/api/categorize`** — Upstash ratelimit, 20 req/hr per IP
13. Add to `.gitignore`: `.env.local`, `drizzle/`
14. Test: Sign in via YNAB → check users + accounts tables → sign out → sign back in
15. Test: Hit `/api/categorize` without auth → verify 200 (not blocked by middleware)

### Phase 2: Multi-tenant Import (~2 sessions)

Files created: `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `app/dashboard/setup/page.tsx`, `app/dashboard/import/page.tsx`, `app/dashboard/history/page.tsx`
Files modified: `app/api/import/route.ts` (lines 5-18 + DAYS_TOLERANCE)

1. Create `app/dashboard/setup/page.tsx`: **email input (required)** + fetch user's budgets via YNAB API → select budget + account → set duplicate tolerance (default 5) → save email to users table, create Stripe Customer, create ynab_connections row, create subscriptions row with `status: 'trialing'` and `current_period_end` = now + 14 days
2. Create dashboard layout with auth check + trial/subscription status check
3. Move current `app/page.tsx` import UI to `app/dashboard/import/page.tsx` (keep inline styles as-is — no Tailwind rewrite)
4. Update `/api/import/route.ts`:
   - Replace env var reads with session + DB lookup
   - `DAYS_TOLERANCE` from `connection.duplicateDaysTolerance` instead of env var
   - Create fresh `new ynab.API(token)` per-request with the refreshed token
5. Add `import_history` writes after successful imports
6. Create history page — simple table
7. **Test on preview URL** (not production): Full flow as authenticated user — setup → email → pick budget → upload CSV → import → verify in YNAB
8. **Verify extension still works**: Hit production `/api/categorize` without auth headers → verify 200

### Phase 3: Stripe Billing (~2 sessions)

Files created: `actions/stripe.ts`, `app/api/stripe/webhook/route.ts`, `app/dashboard/billing/page.tsx`, `app/checkout/page.tsx`
Files modified: `app/dashboard/layout.tsx` (subscription gating)

1. `npm install @stripe/react-stripe-js @stripe/stripe-js`
2. Write Embedded Checkout Server Action — **no trial_period_days** (trial is app-managed, not Stripe-managed)
3. Write webhook route handler — 4 events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
4. Update dashboard layout: allow access if `subscriptions.status IN ('trialing', 'active')` AND `current_period_end > now()`. Show trial-expiring banner when < 3 days remain.
5. Create billing page: shows trial status or subscription status, "Add payment method" button (during trial) or Stripe Portal link (after subscribing)
6. Test: New user → setup → trial starts → import works → manually set `current_period_end` to past → paywall appears → Embedded Checkout → subscription active → import works again

### Phase 4: Landing Page + Legal (~2 sessions)

Files modified: `app/page.tsx` (complete rewrite), `app/layout.tsx`
Files created: `app/pricing/page.tsx`, `app/auth/signin/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`, `tailwind.config.ts`, `postcss.config.js`

1. `npm install tailwindcss @tailwindcss/postcss postcss` + configure. Add Tailwind directives to `globals.css` alongside existing styles (coexistence, not replacement).
2. Rewrite `app/page.tsx` as marketing landing page (10-section structure above) in Tailwind
3. Create pricing page (Tailwind)
4. Style sign-in page with "Connect with YNAB" CTA (Tailwind)
5. Create privacy policy and terms of service pages (resolves #12)
6. Add meta tags, OG image, description for SEO
7. **Set up Vercel environment variables for preview vs production** — YNAB OAuth redirect URIs are exact-match, so `AUTH_URL` must differ per environment
8. Test: Visit landing page → click CTA → OAuth flow → setup → dashboard

### Phase 5: Cutover + Hardening (~1 session)

1. **Merge `saas` branch to `main`** — this is the production cutover (resolves #9)
2. Remove old env vars from Vercel production: `YNAB_ACCESS_TOKEN`, `YNAB_BUDGET_ID`, `YNAB_ACCOUNT_ID`, `YNAB_DUPLICATE_DAYS`
3. Error monitoring (Sentry free tier)
4. Test YNAB token refresh end-to-end (wait for 2-hour expiry or set `expires_at` to past in DB)
5. Test with a fresh YNAB account (not just your own)
6. Verify Chrome extension still works against production with all changes live
7. Test concurrent token refresh: trigger two simultaneous imports and verify advisory lock prevents token corruption
8. If YNAB production review still pending: add waitlist to landing page, cap signups at 20 (reserve 5 for testing)

---

## Environment Variables (New)

```bash
# YNAB OAuth (register at app.ynab.com/oauth/applications)
YNAB_CLIENT_ID=
YNAB_CLIENT_SECRET=

# NextAuth
NEXTAUTH_SECRET=          # openssl rand -base64 32
AUTH_URL=                  # differs per Vercel environment (production vs preview)

# Neon Postgres (auto-set by Vercel Marketplace integration)
DATABASE_URL=
DATABASE_URL_UNPOOLED=

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=

# Upstash Redis (auto-set by Vercel Marketplace integration)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Existing (keep for extension/CLI compatibility, remove from production after cutover)
ANTHROPIC_API_KEY=         # still needed for /api/categorize
```

**Remove after Phase 5 cutover:** `YNAB_ACCESS_TOKEN`, `YNAB_BUDGET_ID`, `YNAB_ACCOUNT_ID`, `YNAB_DUPLICATE_DAYS`

---

## Critical Constraints (Updated)

1. **`/api/categorize` MUST stay public** — Chrome extension at `extension/lib/categorize.ts:9` hardcodes `https://ynab-automation.vercel.app/api/categorize`. Middleware must not match this route. Rate limiting (Upstash) protects against abuse.
2. **`/api/normalize` MUST stay public** — stateless transform, no auth needed, no cost. Middleware must not match.
3. **YNAB refresh tokens are single-use** — every refresh must atomically save both new `access_token` AND new `refresh_token`. Use `pg_advisory_xact_lock` to serialize concurrent refreshes per-user.
4. **YNAB 25-user cap** — OAuth apps start in Restricted Mode. Request production access in Phase 0. Mitigation: waitlist + 20-user cap until approved.
5. **YNAB 200 req/hour** — The duplicate-check loop in `/api/import` (fetching existing transactions) could hit this for users with large histories. Consider adding a warning or delay. This is existing behavior, not new.
6. **No email from YNAB** — Mandatory email collection in `/dashboard/setup` before any billing interaction. Email stored in `users.email`.
7. **Extension is independent** — Chrome extension uses Personal Access Tokens via `chrome.storage`. It is unaffected by the SaaS conversion. Don't try to unify auth flows.
8. **Fresh `ynab.API()` per-request** — Never cache or reuse a YNAB SDK client across requests. Always instantiate with the freshly-fetched token.
9. **Inline styles coexist with Tailwind** — Don't rewrite existing components. New pages use Tailwind, old pages keep inline styles.
10. **Extension's `lib/normalize.ts` is a separate port** — uses Papa Parse, different from the web app's `lib/normalize.ts` which uses `csv-parse`. No shared code coupling.
11. **Preview vs production env vars** — YNAB OAuth redirect URIs are exact-match. `AUTH_URL` must be set per Vercel environment. Preview deploys need their own redirect URI registered with YNAB (or use production URL only during development and test via production).

---

## Verification Plan

| Test | How |
|------|-----|
| Auth flow | Sign in via YNAB OAuth → verify DB records (users, accounts) → sign out → sign back in |
| Email collection | After OAuth, redirected to setup → email required before proceeding |
| Token refresh | Wait for 2-hour expiry (or set `expires_at` to past) → make import → verify auto-refresh + new refresh_token saved |
| Concurrent refresh | Two simultaneous imports → verify advisory lock prevents double-refresh → both succeed |
| Multi-tenant | Create 2 test users → verify each sees only their data |
| Import | Upload CSV → verify transactions in YNAB → check import_history table |
| Duplicate tolerance | Verify per-connection `duplicateDaysTolerance` is used, not env var |
| Trial (no card) | New user → verify trial active → import works → no Stripe checkout triggered |
| Trial expiry | Set `current_period_end` to past → verify paywall → Embedded Checkout → subscription active |
| Rate limit | Hit `/api/categorize` 21 times → verify 429 on 21st |
| Extension | Hit `/api/categorize` without auth headers → verify 200 response |
| CORS | Extension fetch to `/api/categorize` → verify no CORS preflight failures |
| Middleware | Hit `/api/normalize` without auth → verify 200 (not blocked) |
| Landing page | All sections render, CTAs link correctly, mobile responsive |
| Legal pages | Privacy policy and ToS render, linked from footer |
| Preview vs prod | Verify OAuth callback works on preview URL with correct `AUTH_URL` |
