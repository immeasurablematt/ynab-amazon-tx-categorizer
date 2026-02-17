// ── Shared types for the YNAB Amazon Importer extension ──

/** A normalized transaction row ready for YNAB import. */
export interface CsvRow {
  Date: string; // YYYY-MM-DD
  Payee: string;
  Memo: string;
  Amount: number; // negative = outflow, positive = inflow (refund)
  Category: string;
  OrderId?: string;
}

/** Persisted extension settings in chrome.storage.local. */
export interface ExtensionSettings {
  ynabToken: string;
  budgetId: string;
  budgetName: string;
  accountId: string;
  accountName: string;
  anthropicKey: string;
  defaultPayee: string;
  amazonDomain: "amazon.ca" | "amazon.com";
  duplicateDaysTolerance: number;
}

/** A YNAB budget summary (from GET /budgets). */
export interface YnabBudget {
  id: string;
  name: string;
}

/** A YNAB account summary (from GET /budgets/{id}/accounts). */
export interface YnabAccount {
  id: string;
  name: string;
  type: string;
  closed: boolean;
}

/** A YNAB category (from GET /budgets/{id}/categories). */
export interface YnabCategory {
  id: string;
  name: string;
  groupName: string;
  hidden: boolean;
  deleted: boolean;
}

/** An order scraped from an Amazon page by the content script. */
export interface ScrapedOrder {
  orderId: string;
  date: string; // YYYY-MM-DD
  total: number;
  items: ScrapedItem[];
}

/** A single item within a scraped Amazon order. */
export interface ScrapedItem {
  title: string;
  price: number | null; // null if price not found on page
}

/** A keyword-to-category mapping rule. */
export interface CategoryRule {
  keywords: string[];
  category: string;
}

/** Result returned after importing transactions to YNAB. */
export interface ImportResult {
  imported: number;
  skippedDuplicates: number;
  skippedWithinFile: number;
  skippedZeroAmount: number;
  apiDuplicates: number;
  errors: string[];
}

// ── Message types between popup / service worker / content script ──

export type MessageType =
  | "SCRAPE_ORDERS"
  | "ORDERS_SCRAPED"
  | "SCRAPE_ERROR"
  | "CATEGORIZE"
  | "CATEGORIZE_RESULT"
  | "IMPORT"
  | "IMPORT_RESULT"
  | "FETCH_BUDGETS"
  | "FETCH_ACCOUNTS"
  | "GET_PAGE_STATUS";

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

export interface ScrapeOrdersMessage extends ExtensionMessage {
  type: "SCRAPE_ORDERS";
}

export interface OrdersScrapedMessage extends ExtensionMessage {
  type: "ORDERS_SCRAPED";
  payload: ScrapedOrder[];
}

export interface ScrapeErrorMessage extends ExtensionMessage {
  type: "SCRAPE_ERROR";
  payload: { error: string };
}

export interface CategorizeMessage extends ExtensionMessage {
  type: "CATEGORIZE";
  payload: CsvRow[];
}

export interface CategorizeResultMessage extends ExtensionMessage {
  type: "CATEGORIZE_RESULT";
  payload: CsvRow[];
}

export interface ImportMessage extends ExtensionMessage {
  type: "IMPORT";
  payload: CsvRow[];
}

export interface ImportResultMessage extends ExtensionMessage {
  type: "IMPORT_RESULT";
  payload: ImportResult;
}

export interface PageStatusMessage extends ExtensionMessage {
  type: "GET_PAGE_STATUS";
}
