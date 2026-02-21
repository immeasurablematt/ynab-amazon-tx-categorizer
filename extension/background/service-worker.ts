/**
 * Manifest V3 service worker: routes messages between popup, content script,
 * and external APIs (YNAB, Anthropic).
 */
import {
  fetchBudgets,
  fetchAccounts,
  fetchCategories,
  importTransactions,
} from "@lib/ynab-client";
import { normalizeAmazonCsv, ynabReadyToJson, dedupeRows } from "@lib/normalize";
import { categorizeAllByKeywords, categorizeWithAI } from "@lib/categorize";
import { getSettings, saveCategories, savePendingOrders } from "@lib/storage";
import type { CsvRow, ScrapedOrder } from "@lib/types";

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
