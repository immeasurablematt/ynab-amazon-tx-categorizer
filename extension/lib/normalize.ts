/**
 * CSV normalization for Amazon order data.
 * Ported from the Next.js lib/normalize.ts, using Papa Parse instead of csv-parse.
 */
import Papa from "papaparse";
import type { CsvRow } from "./types";

// ── Column detection candidates ──

const DATE_COLS = ["order.date", "order date", "order_date", "date", "order placed", "charged on"];
const AMOUNT_COLS = ["order.total", "order total", "order_total", "item total", "item.total", "total", "amount", "price"];
const MEMO_COLS = ["item.title", "item title", "item_title", "title", "product", "description", "item", "memo", "order.items"];
const ORDER_ID_COLS = ["order id", "order number", "order_id", "orderid"];
const ORDER_TOTAL_COLS = ["order.total", "order total", "order_total"];

// ── Helpers ──

function findColumn(keys: string[], candidates: string[]): string | null {
  const lower: Record<string, string> = {};
  for (const k of keys) {
    lower[k.trim().toLowerCase()] = k;
  }
  for (const c of candidates) {
    if (lower[c.toLowerCase()]) return lower[c.toLowerCase()];
  }
  for (const c of candidates) {
    const norm = c.replace(/[\s.]/g, "");
    for (const k of Object.keys(lower)) {
      if (k.replace(/[\s.]/g, "").includes(norm)) return lower[k];
    }
  }
  return null;
}

function parseDate(s: string): string | null {
  const x = String(s || "").trim();
  if (!x) return null;

  // YYYY-MM-DD
  const m = x.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // MM/DD/YYYY or M/D/YYYY
  const m2 = x.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) return `${m2[3]}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;

  // "January 15, 2025" etc.
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };
  const m3 = x.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i
  );
  if (m3) {
    const month = months[m3[1].toLowerCase()];
    if (month) return `${m3[3]}-${month}-${m3[2].padStart(2, "0")}`;
  }

  return null;
}

function parseAmount(s: unknown): number | null {
  if (s == null || (typeof s === "string" && !s.trim())) return null;
  const x = String(s).replace(/[,$CAD]/g, "").trim();
  const n = parseFloat(x);
  return isNaN(n) ? null : n;
}

// ── CSV Parsing ──

export function parseCsv(csvText: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });
  return result.data;
}

// ── Main normalization ──

/**
 * Parse an Amazon CSV export and normalize it into YNAB-ready rows.
 * Category is left as "Uncategorized" — the categorization engine fills it in.
 */
export function normalizeAmazonCsv(csvText: string, defaultPayee = "Amazon.ca"): CsvRow[] {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return [];

  const keys = Object.keys(rows[0]);
  const dateCol = findColumn(keys, DATE_COLS);
  const amountCol = findColumn(keys, AMOUNT_COLS);
  const memoCol = findColumn(keys, MEMO_COLS);
  const orderIdCol = findColumn(keys, ORDER_ID_COLS);
  const orderTotalCol = findColumn(keys, ORDER_TOTAL_COLS);

  if (!dateCol || !amountCol) return [];

  const out: CsvRow[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const dateStr = parseDate(row[dateCol] ?? "");
    const amountVal = parseAmount(row[amountCol]);
    const memoStr = (row[memoCol ?? ""] ?? "").trim().slice(0, 500);

    if (!dateStr || amountVal == null) continue;

    const isRefund = /return|refund|reimbursement/i.test(memoStr) && amountVal > 0;
    const amountYnab = isRefund ? amountVal : -Math.abs(amountVal);

    const key = `${dateStr}|${amountYnab}|${memoStr.slice(0, 100)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let orderId: string | undefined;
    if (orderIdCol && (row[orderIdCol] ?? "").toString().trim()) {
      orderId = (row[orderIdCol] ?? "").toString().trim();
    } else if (orderTotalCol) {
      const orderTotal = parseAmount(row[orderTotalCol]);
      orderId = orderTotal != null ? `${dateStr}|${orderTotal}` : undefined;
    }

    out.push({
      Date: dateStr,
      Payee: defaultPayee,
      Memo: memoStr || `Order ${dateStr}`,
      Amount: amountYnab,
      Category: "Uncategorized",
      ...(orderId != null ? { OrderId: orderId } : {}),
    });
  }

  return out;
}

/**
 * Parse a YNAB-ready CSV (Date,Payee,Memo,Amount,Category,OrderId) into CsvRow[].
 * Used when re-importing a previously normalized file.
 */
export function ynabReadyToJson(csvText: string): CsvRow[] {
  const rows = parseCsv(csvText);
  const out: CsvRow[] = [];
  const hasOrderId = rows.length > 0 && "OrderId" in rows[0];

  for (const row of rows) {
    const dateStr = (row.Date ?? "").trim();
    const amountStr = (row.Amount ?? "0").replace(/,/g, "");
    let amount = parseFloat(amountStr);
    if (!dateStr || isNaN(amount)) continue;
    if (amount > 0) amount = -amount;

    const csvRow: CsvRow = {
      Date: dateStr,
      Payee: (row.Payee ?? "Amazon.ca").trim(),
      Memo: (row.Memo ?? "").trim().slice(0, 500),
      Amount: amount,
      Category: (row.Category ?? "Uncategorized").trim(),
    };
    if (hasOrderId && (row.OrderId ?? "").toString().trim()) {
      csvRow.OrderId = (row.OrderId ?? "").toString().trim();
    }
    out.push(csvRow);
  }
  return out;
}

/** Deduplicate rows by date + amount (milliunit key). */
export function dedupeRows(rows: CsvRow[]): CsvRow[] {
  const seen = new Set<string>();
  const out: CsvRow[] = [];
  for (const row of rows) {
    const milli = Math.round(row.Amount * 1000);
    const key = `${row.Date}|${milli}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
