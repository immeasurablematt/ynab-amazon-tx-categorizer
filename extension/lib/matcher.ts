/**
 * Matches Amazon scraped orders to uncategorized YNAB transactions
 * by amount (±$0.05) and date (±2 days).
 */
import type {
  ScrapedOrder,
  YnabTransaction,
  MatchResult,
  MatchedTransaction,
  MatchConfidence,
} from "./types";

const AMOUNT_TOLERANCE = 0.05; // dollars
const DATE_TOLERANCE_DAYS = 2;

function daysBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.abs((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
}

function amountMatches(orderTotal: number, ynabMilliunits: number): boolean {
  const ynabDollars = Math.abs(ynabMilliunits) / 1000;
  return Math.abs(orderTotal - ynabDollars) < AMOUNT_TOLERANCE;
}

/**
 * Returns the title of the highest-value item in an order.
 * Used for AI categorization (one category per YNAB transaction).
 */
export function highestValueItem(order: ScrapedOrder): string {
  if (order.items.length === 0) return "Amazon purchase";
  let best = order.items[0];
  for (const item of order.items) {
    if ((item.price ?? 0) > (best.price ?? 0)) best = item;
  }
  return best.title;
}

/**
 * Match Amazon orders to YNAB transactions.
 * Each order/transaction can only match once (greedy, closest-date-first).
 */
export function matchTransactions(
  orders: ScrapedOrder[],
  transactions: YnabTransaction[]
): MatchResult {
  const matched: MatchedTransaction[] = [];
  const usedOrders = new Set<number>();
  const usedTransactions = new Set<number>();

  for (let ti = 0; ti < transactions.length; ti++) {
    const txn = transactions[ti];

    // Find all candidate orders for this transaction
    const candidates: { orderIdx: number; dateDiff: number }[] = [];

    for (let oi = 0; oi < orders.length; oi++) {
      if (usedOrders.has(oi)) continue;
      const order = orders[oi];

      if (!amountMatches(order.total, txn.amount)) continue;
      const dd = daysBetween(order.date, txn.date);
      if (dd > DATE_TOLERANCE_DAYS) continue;

      candidates.push({ orderIdx: oi, dateDiff: dd });
    }

    if (candidates.length === 0) continue;

    // Sort by date proximity
    candidates.sort((a, b) => a.dateDiff - b.dateDiff);

    let confidence: MatchConfidence;
    if (candidates.length === 1 && candidates[0].dateDiff === 0) {
      confidence = "high";
    } else if (candidates.length === 1) {
      confidence = "medium";
    } else {
      // Multiple candidates — still pick the closest, but flag as ambiguous
      confidence = "ambiguous";
    }

    const bestIdx = candidates[0].orderIdx;
    usedOrders.add(bestIdx);
    usedTransactions.add(ti);

    matched.push({
      order: orders[bestIdx],
      transaction: txn,
      suggestedCategory: "",    // filled in by caller after AI categorization
      suggestedCategoryId: "",  // filled in by caller after AI categorization
      confidence,
      approved: confidence !== "ambiguous", // pre-check high/medium, not ambiguous
    });
  }

  const unmatchedOrders = orders.filter((_, i) => !usedOrders.has(i));
  const unmatchedTransactions = transactions.filter((_, i) => !usedTransactions.has(i));

  return { matched, unmatchedOrders, unmatchedTransactions };
}
