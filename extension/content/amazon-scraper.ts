/**
 * Content script: runs on Amazon order history pages.
 * Listens for SCRAPE_ORDERS messages from the service worker and
 * scrapes order data from the current page DOM.
 */
import type { ScrapedOrder, ScrapedItem } from "@lib/types";

function scrapeOrdersFromPage(): ScrapedOrder[] {
  const orders: ScrapedOrder[] = [];

  // Amazon order history uses .order-card or .order elements
  // Try multiple selector strategies for resilience
  const orderCards = document.querySelectorAll(
    ".order-card, .order, [data-component='order'], .a-box-group.order"
  );

  if (orderCards.length === 0) {
    // Fallback: try the newer Amazon layout
    return scrapeNewLayout();
  }

  orderCards.forEach((card) => {
    try {
      const order = parseOrderCard(card);
      if (order) orders.push(order);
    } catch {
      // Skip malformed order cards
    }
  });

  return orders;
}

function parseOrderCard(card: Element): ScrapedOrder | null {
  // ── Order ID ──
  const orderIdEl = card.querySelector(
    "[data-order-id], .yohtmlc-order-id .value, .order-info .value"
  );
  const orderId =
    orderIdEl?.getAttribute("data-order-id") ??
    orderIdEl?.textContent?.trim() ??
    "";

  // ── Date ──
  const dateEl = card.querySelector(
    ".order-info .a-color-secondary.value, [data-testid='order-date'], .order-date .value"
  );
  const dateText = dateEl?.textContent?.trim() ?? "";
  const date = parseAmazonDate(dateText);
  if (!date) return null;

  // ── Total ──
  const totalEl = card.querySelector(
    ".yohtmlc-order-total .value, .order-total .value, [data-testid='order-total']"
  );
  const totalText = totalEl?.textContent?.trim() ?? "";
  const total = parseAmazonAmount(totalText);
  if (total === null) return null;

  // ── Items ──
  const items: ScrapedItem[] = [];
  const itemEls = card.querySelectorAll(
    ".yohtmlc-product-title, .a-link-normal[href*='/dp/'], [data-component='itemTitle']"
  );
  itemEls.forEach((el) => {
    const title = el.textContent?.trim() ?? "";
    if (!title) return;

    // Try to find the price next to this item
    const priceEl = el
      .closest(".a-row, .item-row, [data-component='item']")
      ?.querySelector(".a-price .a-offscreen, .item-price");
    const price = priceEl ? parseAmazonAmount(priceEl.textContent ?? "") : null;

    items.push({ title: title.slice(0, 500), price });
  });

  // If no items found, use a generic memo
  if (items.length === 0) {
    items.push({ title: `Amazon order ${orderId || date}`, price: total });
  }

  return { orderId, date, total, items };
}

function scrapeNewLayout(): ScrapedOrder[] {
  // Amazon's 2024+ layout uses different selectors
  const orders: ScrapedOrder[] = [];
  const containers = document.querySelectorAll(".order-card, [class*='order-card']");

  containers.forEach((container) => {
    try {
      // Try generic extraction
      const texts = container.querySelectorAll("span, a");
      let date = "";
      let total = 0;
      let orderId = "";
      const items: ScrapedItem[] = [];

      texts.forEach((el) => {
        const text = el.textContent?.trim() ?? "";
        // Detect date patterns
        if (!date && /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/.test(text)) {
          date = parseAmazonDate(text) ?? "";
        }
        // Detect price patterns for total
        if (!total && /^\$[\d,]+\.\d{2}$/.test(text)) {
          total = parseAmazonAmount(text) ?? 0;
        }
        // Detect order IDs
        if (!orderId && /^\d{3}-\d{7}-\d{7}$/.test(text)) {
          orderId = text;
        }
        // Detect product links
        const link = el.closest("a");
        if (link?.href?.includes("/dp/") || link?.href?.includes("/gp/product/")) {
          items.push({ title: text.slice(0, 500), price: null });
        }
      });

      if (date && total) {
        if (items.length === 0) {
          items.push({ title: `Amazon order ${orderId || date}`, price: total });
        }
        orders.push({ orderId, date, total, items });
      }
    } catch {
      // Skip
    }
  });

  return orders;
}

function parseAmazonDate(text: string): string | null {
  if (!text) return null;
  // "January 15, 2025" → "2025-01-15"
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
  // "2025-01-15"
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
    return true; // keep channel open for async response
  }

  if (message.type === "GET_PAGE_STATUS") {
    // Tell the popup whether we're on an Amazon order page
    const isOrderPage = !!document.querySelector(
      ".order-card, .order, [data-component='order'], .a-box-group.order"
    );
    sendResponse({ isOrderPage, url: window.location.href });
    return true;
  }
});

// ── Notify service worker that content script is loaded ──
chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY" }).catch(() => {
  // Service worker might not be listening yet, that's ok
});
