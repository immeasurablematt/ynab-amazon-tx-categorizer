/**
 * Content script: runs on Amazon order history pages.
 * Listens for SCRAPE_ORDERS messages from the service worker and
 * scrapes order data from the current page DOM.
 *
 * Selector strategy confirmed against amazon.ca order history (Feb 2026):
 *   - Order headers: UL.order-header__header-list (one per order)
 *   - Metadata items: LI.order-header__header-list-item (date, total, order#)
 *   - Order total: SPAN.a-size-base.a-color-secondary.aok-break-word inside a header LI
 *   - Order ID: extracted from order-detail links (href contains orderID=)
 *   - Item titles: A[href*="/dp/"] within the order card container
 */
import type { ScrapedOrder, ScrapedItem } from "@lib/types";

function scrapeOrdersFromPage(): ScrapedOrder[] {
  // Primary: Amazon's current BEM layout (confirmed Feb 2026)
  const orderHeaders = document.querySelectorAll(".order-header__header-list");
  if (orderHeaders.length > 0) {
    const orders: ScrapedOrder[] = [];
    orderHeaders.forEach((ul) => {
      try {
        const order = parseOrderFromHeader(ul);
        if (order) orders.push(order);
      } catch {
        // Skip malformed entries
      }
    });
    return orders;
  }

  // Legacy fallback: older Amazon layout
  const legacyCards = document.querySelectorAll(
    ".order-card, .order, [data-component='order'], .a-box-group.order, [data-order-id]"
  );
  if (legacyCards.length > 0) {
    const orders: ScrapedOrder[] = [];
    legacyCards.forEach((card) => {
      try {
        const order = parseLegacyOrderCard(card);
        if (order) orders.push(order);
      } catch {
        // Skip
      }
    });
    return orders;
  }

  return [];
}

/**
 * Parse an order from the current Amazon layout (Feb 2026+).
 * UL.order-header__header-list is the anchor point.
 */
function parseOrderFromHeader(ul: Element): ScrapedOrder | null {
  const listItems = ul.querySelectorAll("li, .order-header__header-list-item");

  let dateText = "";
  let totalText = "";
  let orderId = "";

  listItems.forEach((li) => {
    const text = li.textContent?.trim() ?? "";
    if (!text) return;

    // Date: look for month name patterns
    if (!dateText && /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(text)) {
      const match = text.match(
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i
      );
      if (match) dateText = match[0];
    }

    // Total: first dollar amount (order total is prominently shown)
    if (!totalText) {
      const match = text.match(/\$[\d,]+\.\d{2}/);
      if (match) totalText = match[0];
    }

    // Order ID: 3-7-7 digit pattern
    if (!orderId) {
      const match = text.match(/\b(\d{3}-\d{7}-\d{7})\b/);
      if (match) orderId = match[1];
    }
  });

  const date = parseAmazonDate(dateText);
  const total = parseAmazonAmount(totalText);
  if (!date || total === null) return null;

  // Find the order card container: walk up from UL to nearest .a-box ancestor
  const container = findOrderContainer(ul);

  // Try to get order ID from a detail link if not found in text
  if (!orderId && container) {
    const links = container.querySelectorAll(
      "a[href*='orderID='], a[href*='order-details'], a[href*='order-items']"
    );
    for (const link of Array.from(links)) {
      const href = (link as HTMLAnchorElement).href ?? "";
      const m = href.match(/[?&]orderID=([^&]+)/i) ??
                href.match(/order[^?]*\/([A-Z0-9]{3}-[0-9]{7}-[0-9]{7})/i);
      if (m) {
        orderId = decodeURIComponent(m[1]);
        break;
      }
    }
  }

  // Find product items
  const items = extractItems(container, total, date, orderId);

  return { orderId, date, total, items };
}

/**
 * Walk up from a UL.order-header__header-list to find the containing order card.
 * Returns the nearest .a-box ancestor, or falls back to a fixed-depth ancestor.
 */
function findOrderContainer(ul: Element): Element | null {
  let el: Element | null = ul;
  // Walk up to 15 levels looking for an .a-box that likely wraps a full order
  for (let i = 0; i < 15; i++) {
    el = el?.parentElement ?? null;
    if (!el) break;
    if (
      el.classList.contains("a-box") &&
      // Prefer larger boxes (order cards) over small inner boxes
      (el.querySelectorAll("a[href*='/dp/']").length > 0 ||
        el.querySelectorAll(".order-header__header-list").length > 0)
    ) {
      return el;
    }
  }
  // Fallback: go 8 levels up (past the a-fixed-right-grid structure)
  el = ul;
  for (let i = 0; i < 8; i++) {
    el = el?.parentElement ?? null;
    if (!el) break;
  }
  return el;
}

/**
 * Extract item titles from a container element.
 */
function extractItems(
  container: Element | null,
  fallbackTotal: number,
  fallbackDate: string,
  orderId: string
): ScrapedItem[] {
  const items: ScrapedItem[] = [];

  if (container) {
    // Product title links — prefer links with /dp/ (product detail pages)
    const seen = new Set<string>();
    const productLinks = container.querySelectorAll(
      "a[href*='/dp/'], a[href*='/gp/product/']"
    );

    productLinks.forEach((link) => {
      const title = link.textContent?.trim() ?? "";
      // Skip short/empty/duplicate titles and navigation-style links
      if (!title || title.length < 4 || seen.has(title)) return;
      // Skip "View your item" / "Write a review" style boilerplate
      if (/^(view|write|return|track|buy|share|order|see|get)\b/i.test(title)) return;
      seen.add(title);

      // Try to find item price
      const priceEl = link
        .closest(".a-row, .a-column, .item, [class*='item']")
        ?.querySelector(".a-price .a-offscreen, .a-price span:first-child");
      const price = priceEl ? parseAmazonAmount(priceEl.textContent ?? "") : null;

      items.push({ title: title.slice(0, 500), price });
    });
  }

  // Fallback: generic memo if no items found
  if (items.length === 0) {
    items.push({
      title: `Amazon order ${orderId || fallbackDate}`,
      price: fallbackTotal,
    });
  }

  return items;
}

/**
 * Legacy parser for older Amazon order history layouts.
 */
function parseLegacyOrderCard(card: Element): ScrapedOrder | null {
  const orderIdEl = card.querySelector(
    "[data-order-id], .yohtmlc-order-id .value, .order-info .value"
  );
  const orderId =
    orderIdEl?.getAttribute("data-order-id") ??
    orderIdEl?.textContent?.trim() ??
    "";

  const dateEl = card.querySelector(
    ".order-info .a-color-secondary.value, [data-testid='order-date'], .order-date .value"
  );
  const dateText = dateEl?.textContent?.trim() ?? "";
  const date = parseAmazonDate(dateText);
  if (!date) return null;

  const totalEl = card.querySelector(
    ".yohtmlc-order-total .value, .order-total .value, [data-testid='order-total']"
  );
  const totalText = totalEl?.textContent?.trim() ?? "";
  const total = parseAmazonAmount(totalText);
  if (total === null) return null;

  return {
    orderId,
    date,
    total,
    items: [{ title: `Amazon order ${orderId || date}`, price: total }],
  };
}

function parseAmazonDate(text: string): string | null {
  if (!text) return null;
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };
  const match = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i
  );
  if (match) {
    const month = months[match[1].toLowerCase()];
    const day = match[2].padStart(2, "0");
    return `${match[3]}-${month}-${day}`;
  }
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];
  return null;
}

function parseAmazonAmount(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[,$CAD\s]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ── Message listener ──
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SCRAPE_ORDERS") {
    try {
      const orders = scrapeOrdersFromPage();
      sendResponse({ orders });
    } catch (e) {
      sendResponse({ error: e instanceof Error ? e.message : "Scrape failed" });
    }
    return true;
  }

  if (message.type === "GET_PAGE_STATUS") {
    const isOrderPage = !!(
      document.querySelector(".order-header__header-list") ||
      document.querySelector(".order-card, .order, [data-order-id]")
    );
    sendResponse({ isOrderPage, url: window.location.href });
    return true;
  }
});

// ── Notify service worker that content script is loaded ──
chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY" }).catch(() => {
  // Service worker might not be listening yet, that's ok
});
