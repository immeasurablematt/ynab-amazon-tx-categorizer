/**
 * Manifest V3 service worker: routes messages between popup, content script,
 * and external APIs (YNAB, Anthropic).
 */
import {
  fetchBudgets,
  fetchAccounts,
  fetchCategories,
  importTransactions,
  fetchUncategorizedAmazonTransactions,
  updateTransactionCategories,
} from "@lib/ynab-client";
import { normalizeAmazonCsv, ynabReadyToJson, dedupeRows } from "@lib/normalize";
import { categorizeAllByKeywords, categorizeWithAI } from "@lib/categorize";
import { getSettings, saveCategories, savePendingOrders } from "@lib/storage";
import { matchTransactions, highestValueItem } from "@lib/matcher";
import type { CsvRow, ScrapedOrder, MatchResult, MatchedTransaction } from "@lib/types";

// ── Message handler ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "FETCH_BUDGETS":
      handleFetchBudgets(message.payload).then(sendResponse);
      return true;

    case "FETCH_ACCOUNTS":
      handleFetchAccounts(message.payload).then(sendResponse);
      return true;

    case "SCRAPE_ORDERS":
      handleScrapeOrders().then(sendResponse);
      return true;

    case "PARSE_CSV":
      handleParseCsv(message.payload).then(sendResponse);
      return true;

    case "CATEGORIZE":
      handleCategorize(message.payload).then(sendResponse);
      return true;

    case "IMPORT":
      handleImport(message.payload).then(sendResponse);
      return true;

    case "SYNC_CATEGORIES":
      handleSyncCategories().then(sendResponse);
      return true;

    case "FETCH_UNCATEGORIZED_TRANSACTIONS":
      handleFetchUncategorized(message.payload).then(sendResponse);
      return true;

    case "UPDATE_TRANSACTION_CATEGORIES":
      handleUpdateCategories(message.payload).then(sendResponse);
      return true;

    case "MATCH_AND_CATEGORIZE":
      handleMatchAndCategorize(message.payload).then(sendResponse);
      return true;

    case "CONTENT_SCRIPT_READY":
      if (sender.tab?.id) {
        chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
        chrome.action.setBadgeText({ text: "!", tabId: sender.tab.id });
      }
      return false;
  }
});

// ── Handlers ──

async function handleFetchBudgets(
  payload: { token: string }
): Promise<{ budgets?: { id: string; name: string }[]; error?: string }> {
  try {
    const budgets = await fetchBudgets(payload.token);
    return { budgets };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to fetch budgets" };
  }
}

async function handleFetchAccounts(
  payload: { token: string; budgetId: string }
): Promise<{ accounts?: { id: string; name: string }[]; error?: string }> {
  try {
    const accounts = await fetchAccounts(payload.token, payload.budgetId);
    return { accounts };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to fetch accounts" };
  }
}

async function handleScrapeOrders(): Promise<{
  orders?: CsvRow[];
  error?: string;
}> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return { error: "No active tab" };
    if (!tab.url?.includes("amazon.ca") && !tab.url?.includes("amazon.com")) {
      return { error: "Not on an Amazon page. Navigate to your order history first." };
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_ORDERS" });
    if (response.error) return { error: response.error };

    const settings = await getSettings();
    const scrapedOrders: ScrapedOrder[] = response.orders ?? [];

    // Convert scraped orders to CsvRows
    const rows: CsvRow[] = scrapedOrders.flatMap((order) =>
      order.items.map((item) => ({
        Date: order.date,
        Payee: settings.defaultPayee || "Amazon.ca",
        Memo: item.title,
        Amount: -(item.price ?? order.total),
        Category: "Uncategorized",
        OrderId: order.orderId,
      }))
    );

    // Apply keyword categorization
    const categorized = await categorizeAllByKeywords(rows);
    await savePendingOrders(categorized);
    return { orders: categorized };
  } catch {
    return { error: "Could not connect to Amazon page. Try refreshing." };
  }
}

async function handleParseCsv(
  payload: { csvText: string }
): Promise<{ orders?: CsvRow[]; error?: string }> {
  try {
    const settings = await getSettings();

    // Try YNAB-ready format first (has Date,Payee,Memo,Amount,Category headers)
    let rows: CsvRow[];
    if (payload.csvText.trimStart().startsWith("Date,")) {
      const parsed = ynabReadyToJson(payload.csvText);
      const hasOrderId = parsed.some((r) => (r.OrderId ?? "").trim() !== "");
      rows = hasOrderId ? parsed : dedupeRows(parsed);
    } else {
      rows = normalizeAmazonCsv(payload.csvText, settings.defaultPayee);
    }

    if (rows.length === 0) {
      return { error: "No valid rows found in CSV" };
    }

    // Apply keyword categorization to uncategorized rows
    const categorized = await categorizeAllByKeywords(rows);
    await savePendingOrders(categorized);
    return { orders: categorized };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to parse CSV" };
  }
}

async function handleCategorize(
  rows: CsvRow[]
): Promise<{ orders?: CsvRow[]; error?: string }> {
  try {
    const settings = await getSettings();

    const categories = await fetchCategories(settings.ynabToken, settings.budgetId);
    const categorized = await categorizeWithAI(rows, categories);

    await savePendingOrders(categorized);
    return { orders: categorized };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Categorization failed" };
  }
}

async function handleImport(
  rows: CsvRow[]
): Promise<{ result?: unknown; error?: string }> {
  try {
    const settings = await getSettings();
    if (!settings.ynabToken || !settings.budgetId || !settings.accountId) {
      return { error: "YNAB credentials not configured. Open Settings." };
    }

    const result = await importTransactions(
      settings.ynabToken,
      settings.budgetId,
      settings.accountId,
      rows,
      settings.duplicateDaysTolerance
    );

    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import failed" };
  }
}

async function handleSyncCategories(): Promise<{ categories?: unknown[]; error?: string }> {
  try {
    const settings = await getSettings();
    if (!settings.ynabToken || !settings.budgetId) {
      return { error: "YNAB credentials not configured." };
    }
    const categories = await fetchCategories(settings.ynabToken, settings.budgetId);
    await saveCategories(categories);
    return { categories };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to sync categories" };
  }
}

// ── Match & Categorize handlers ──

async function handleFetchUncategorized(
  payload: { sinceDate: string }
): Promise<{ transactions?: unknown[]; error?: string }> {
  try {
    const settings = await getSettings();
    if (!settings.ynabToken || !settings.budgetId || !settings.accountId) {
      return { error: "YNAB credentials not configured. Open Settings." };
    }
    const transactions = await fetchUncategorizedAmazonTransactions(
      settings.ynabToken,
      settings.budgetId,
      settings.accountId,
      payload.sinceDate
    );
    return { transactions };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to fetch YNAB transactions" };
  }
}

async function handleUpdateCategories(
  payload: { updates: { id: string; category_id: string }[] }
): Promise<{ updated?: number; error?: string }> {
  try {
    const settings = await getSettings();
    if (!settings.ynabToken || !settings.budgetId) {
      return { error: "YNAB credentials not configured." };
    }
    const result = await updateTransactionCategories(
      settings.ynabToken,
      settings.budgetId,
      payload.updates
    );
    return { updated: result.updated };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update categories" };
  }
}

async function handleMatchAndCategorize(
  payload: { sinceDate: string }
): Promise<{ result?: MatchResult; error?: string; debug?: string[] }> {
  const debug: string[] = [];
  try {
    const settings = await getSettings();
    debug.push(`Settings: token=${settings.ynabToken ? "set" : "MISSING"}, budget=${settings.budgetId ? "set" : "MISSING"}, account=${settings.accountId ? "set" : "MISSING"}`);

    if (!settings.ynabToken || !settings.budgetId || !settings.accountId) {
      return { error: "YNAB credentials not configured. Open Settings.", debug };
    }

    // 1. Scrape orders from current Amazon page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    debug.push(`Active tab: id=${tab?.id}, url=${tab?.url?.slice(0, 80)}`);

    if (!tab?.id) return { error: "No active tab", debug };
    if (!tab.url?.includes("amazon.ca") && !tab.url?.includes("amazon.com")) {
      return { error: "Not on an Amazon page. Navigate to your order history first.", debug };
    }

    let scrapeResponse: { orders?: ScrapedOrder[]; error?: string };
    try {
      scrapeResponse = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_ORDERS" });
      debug.push(`Scrape response: ${scrapeResponse.error ?? `${scrapeResponse.orders?.length ?? 0} orders`}`);
    } catch (e) {
      debug.push(`Scrape FAILED: ${e instanceof Error ? e.message : String(e)}`);
      return { error: "Content script not running. Refresh the Amazon page and try again.", debug };
    }

    if (scrapeResponse.error) return { error: scrapeResponse.error, debug };
    const scrapedOrders: ScrapedOrder[] = scrapeResponse.orders ?? [];

    if (scrapedOrders.length === 0) {
      debug.push("Scraper returned 0 orders — page may not have order cards, or selectors don't match");
      return { error: "No orders found on this page. Navigate to your Amazon order history and try again.", debug };
    }

    debug.push(`Scraped ${scrapedOrders.length} orders. First: ${scrapedOrders[0].items[0]?.title?.slice(0, 40) ?? "no items"} ($${scrapedOrders[0].total})`);

    // 2. Fetch uncategorized Amazon transactions from YNAB
    const ynabTransactions = await fetchUncategorizedAmazonTransactions(
      settings.ynabToken,
      settings.budgetId,
      settings.accountId,
      payload.sinceDate
    );
    debug.push(`YNAB: ${ynabTransactions.length} uncategorized Amazon transactions since ${payload.sinceDate}`);

    if (ynabTransactions.length === 0) {
      return {
        result: {
          matched: [],
          unmatchedOrders: scrapedOrders,
          unmatchedTransactions: [],
        },
        debug,
      };
    }

    // 3. Match orders to transactions
    const matchResult = matchTransactions(scrapedOrders, ynabTransactions);
    debug.push(`Matched: ${matchResult.matched.length}, unmatched orders: ${matchResult.unmatchedOrders.length}, unmatched txns: ${matchResult.unmatchedTransactions.length}`);

    // 4. AI-categorize matched items using highest-value item title
    if (matchResult.matched.length > 0) {
      const categories = await fetchCategories(settings.ynabToken, settings.budgetId);
      await saveCategories(categories);
      debug.push(`Fetched ${categories.length} YNAB categories`);

      // Build CsvRows from matched items for categorization
      const rowsForAI: CsvRow[] = matchResult.matched.map((m) => ({
        Date: m.order.date,
        Payee: "Amazon",
        Memo: highestValueItem(m.order),
        Amount: -m.order.total,
        Category: "Uncategorized",
      }));

      try {
        const categorized = await categorizeWithAI(rowsForAI, categories);
        debug.push(`AI categorized ${categorized.filter((r) => r.Category !== "Uncategorized").length}/${categorized.length} items`);

        // Map categories back to matched transactions
        const categoryIdMap: Record<string, string> = {};
        for (const cat of categories) {
          categoryIdMap[cat.name.toLowerCase()] = cat.id;
        }

        for (let i = 0; i < matchResult.matched.length; i++) {
          const catName = categorized[i]?.Category ?? "Uncategorized";
          matchResult.matched[i].suggestedCategory = catName;
          matchResult.matched[i].suggestedCategoryId =
            categoryIdMap[catName.toLowerCase()] ?? "";
        }
      } catch (e) {
        debug.push(`AI categorization failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { result: matchResult, debug };
  } catch (e) {
    debug.push(`FATAL: ${e instanceof Error ? e.message : String(e)}`);
    return { error: e instanceof Error ? e.message : "Match & categorize failed", debug };
  }
}
