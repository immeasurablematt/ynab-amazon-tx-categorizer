/**
 * Browser-compatible YNAB API client using fetch().
 * Replaces the Node.js `ynab` SDK which doesn't work in extension context.
 */
import type { YnabBudget, YnabAccount, YnabCategory, YnabTransaction, CsvRow, ImportResult } from "./types";

const BASE = "https://api.ynab.com/v1";

// ── Generic fetch helper ──

async function ynabFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { detail?: string } };
    throw new Error(body.error?.detail ?? `YNAB API error: ${res.status}`);
  }
  return (await res.json()) as T;
}

// ── Read endpoints ──

export async function fetchBudgets(token: string): Promise<YnabBudget[]> {
  const data = await ynabFetch<{
    data: { budgets: { id: string; name: string }[] };
  }>(token, "/budgets");
  return data.data.budgets.map((b) => ({ id: b.id, name: b.name }));
}

export async function fetchAccounts(token: string, budgetId: string): Promise<YnabAccount[]> {
  const data = await ynabFetch<{
    data: {
      accounts: { id: string; name: string; type: string; closed: boolean; deleted: boolean }[];
    };
  }>(token, `/budgets/${budgetId}/accounts`);
  return data.data.accounts
    .filter((a) => !a.closed && !a.deleted)
    .map((a) => ({ id: a.id, name: a.name, type: a.type, closed: false }));
}

export async function fetchCategories(token: string, budgetId: string): Promise<YnabCategory[]> {
  const data = await ynabFetch<{
    data: {
      category_groups: {
        name: string;
        deleted: boolean;
        hidden: boolean;
        categories: { id: string; name: string; deleted: boolean; hidden: boolean }[];
      }[];
    };
  }>(token, `/budgets/${budgetId}/categories`);

  const categories: YnabCategory[] = [];
  for (const group of data.data.category_groups) {
    if (group.deleted || group.hidden) continue;
    for (const cat of group.categories) {
      if (cat.deleted || cat.hidden) continue;
      categories.push({
        id: cat.id,
        name: cat.name,
        groupName: group.name,
        hidden: false,
        deleted: false,
      });
    }
  }
  return categories;
}

/** Fetch existing transactions from an account since a given date (for duplicate detection). */
export async function fetchTransactionsSince(
  token: string,
  budgetId: string,
  accountId: string,
  sinceDate: string
): Promise<{ amount: number; date: string }[]> {
  const PAGE_SIZE = 500;
  const all: { amount: number; date: string }[] = [];
  let since = sinceDate;

  while (true) {
    const data = await ynabFetch<{
      data: {
        transactions: {
          amount: number;
          date: string;
          deleted: boolean;
        }[];
      };
    }>(token, `/budgets/${budgetId}/accounts/${accountId}/transactions?since_date=${since}`);

    const txs = data.data.transactions ?? [];
    for (const tx of txs) {
      if (tx.deleted || tx.amount == null || !tx.date) continue;
      const dt = typeof tx.date === "string" ? tx.date.slice(0, 10) : "";
      if (dt) all.push({ amount: tx.amount, date: dt });
    }

    if (txs.length < PAGE_SIZE || txs.length === 0) break;

    // Paginate by advancing since_date past the latest
    let latest = "";
    for (const tx of txs) {
      const d = typeof tx.date === "string" ? tx.date.slice(0, 10) : "";
      if (d && d > latest) latest = d;
    }
    if (!latest) break;
    const next = new Date(latest);
    next.setDate(next.getDate() + 1);
    since = next.toISOString().slice(0, 10);
  }

  return all;
}

// ── Match & Categorize endpoints ──

/**
 * Fetch uncategorized transactions from a YNAB account where the payee
 * looks like Amazon. Filters client-side since the YNAB API doesn't
 * support server-side payee or category filtering.
 */
export async function fetchUncategorizedAmazonTransactions(
  token: string,
  budgetId: string,
  accountId: string,
  sinceDate: string
): Promise<YnabTransaction[]> {
  const data = await ynabFetch<{
    data: {
      transactions: {
        id: string;
        date: string;
        amount: number;
        payee_name: string | null;
        category_id: string | null;
        category_name: string | null;
        memo: string | null;
        deleted: boolean;
      }[];
    };
  }>(token, `/budgets/${budgetId}/accounts/${accountId}/transactions?since_date=${sinceDate}`);

  const amazonPattern = /amazon|amzn/i;

  return data.data.transactions
    .filter((tx) => {
      if (tx.deleted) return false;
      if (tx.category_id) return false; // already categorized
      const payee = tx.payee_name ?? "";
      return amazonPattern.test(payee);
    })
    .map((tx) => ({
      id: tx.id,
      date: tx.date,
      amount: tx.amount,
      payee_name: tx.payee_name ?? "Amazon",
      category_id: tx.category_id,
      category_name: tx.category_name,
      memo: tx.memo,
    }));
}

/**
 * Bulk-update categories on existing YNAB transactions.
 * Uses PATCH /budgets/{id}/transactions (supports batch updates).
 */
export async function updateTransactionCategories(
  token: string,
  budgetId: string,
  updates: { id: string; category_id: string }[]
): Promise<{ updated: number }> {
  if (updates.length === 0) return { updated: 0 };

  const data = await ynabFetch<{
    data: { transactions?: unknown[] };
  }>(token, `/budgets/${budgetId}/transactions`, {
    method: "PATCH",
    body: JSON.stringify({
      transactions: updates.map((u) => ({
        id: u.id,
        category_id: u.category_id,
      })),
    }),
  });

  return { updated: data.data.transactions?.length ?? 0 };
}

// ── Transaction types for the YNAB API ──

interface YnabSubTransaction {
  amount: number;
  category_id: string | null;
  memo: string | null;
}

interface YnabNewTransaction {
  account_id: string;
  date: string;
  amount: number;
  payee_name: string;
  memo: string | null;
  category_id: string | null;
  cleared: string;
  approved: boolean;
  import_id: string;
  subtransactions?: YnabSubTransaction[];
}

// ── Build & import transactions ──

/**
 * Full import pipeline: takes CsvRows, builds YNAB transactions
 * (with category mapping, order grouping, split transactions),
 * and posts them to YNAB. Returns import result.
 */
export async function importTransactions(
  token: string,
  budgetId: string,
  accountId: string,
  csvRows: CsvRow[],
  daysTolerance: number
): Promise<ImportResult> {
  // 1. Fetch categories for ID mapping
  const categories = await fetchCategories(token, budgetId);
  const categoryIdMap: Record<string, string> = {};
  for (const cat of categories) {
    categoryIdMap[cat.name.toLowerCase()] = cat.id;
  }

  // 2. Filter out zero-amount rows
  const rows = csvRows.filter((r) => Math.round(r.Amount * 1000) !== 0);
  const skippedZeroAmount = csvRows.length - rows.length;

  if (rows.length === 0) {
    return {
      imported: 0,
      skippedDuplicates: 0,
      skippedWithinFile: 0,
      skippedZeroAmount,
      apiDuplicates: 0,
      errors: csvRows.length === 0 ? ["No valid rows"] : ["All rows were zero amount"],
    };
  }

  // 3. Fetch existing transactions for duplicate detection
  const minDate = rows.reduce((a, r) => (r.Date < a ? r.Date : a), rows[0].Date);
  const sinceStart = new Date(minDate);
  sinceStart.setDate(sinceStart.getDate() - daysTolerance);
  const sinceDateStr = sinceStart.toISOString().slice(0, 10);

  const existingTxs = await fetchTransactionsSince(token, budgetId, accountId, sinceDateStr);
  const existingByAmount: Record<number, string[]> = {};
  for (const tx of existingTxs) {
    if (!existingByAmount[tx.amount]) existingByAmount[tx.amount] = [];
    existingByAmount[tx.amount].push(tx.date);
  }

  function isDuplicate(importDate: string, amountMilli: number): boolean {
    const dates = existingByAmount[amountMilli];
    if (!dates) return false;
    const imp = new Date(importDate);
    for (const d of dates) {
      const ex = new Date(d);
      const diff = Math.abs((imp.getTime() - ex.getTime()) / (1000 * 60 * 60 * 24));
      if (diff <= daysTolerance) return true;
    }
    return false;
  }

  // 4. Group by OrderId when present; else each row is its own group
  const groups = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const key = row.OrderId?.trim()
      ? row.OrderId.trim()
      : `${row.Date}|${Math.round(row.Amount * 1000)}|${(row.Memo || "").slice(0, 60)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  // 5. Build transactions (single or split)
  const transactions: YnabNewTransaction[] = [];
  let skippedDuplicates = 0;

  for (const [, groupRows] of groups) {
    const first = groupRows[0];
    const dateStr = new Date(first.Date).toISOString().slice(0, 10);
    const totalMilli = groupRows.reduce((s, r) => s + Math.round(r.Amount * 1000), 0);

    if (totalMilli === 0) continue;
    if (isDuplicate(first.Date, totalMilli)) {
      skippedDuplicates++;
      continue;
    }

    const payee = first.Payee?.trim() || "Amazon.ca";
    const memo = first.Memo?.trim().slice(0, 500) || null;

    // Aggregate amounts by category_id
    const catAmounts = new Map<string | null, number>();
    for (const row of groupRows) {
      const cid =
        row.Category && categoryIdMap[row.Category.toLowerCase()]
          ? categoryIdMap[row.Category.toLowerCase()]
          : null;
      const amt = Math.round(row.Amount * 1000);
      catAmounts.set(cid, (catAmounts.get(cid) ?? 0) + amt);
    }

    const importId = `YNAB:${totalMilli}:${dateStr}:1`;

    if (catAmounts.size <= 1) {
      const onlyCatId = catAmounts.keys().next().value ?? null;
      transactions.push({
        account_id: accountId,
        date: dateStr,
        amount: totalMilli,
        payee_name: payee,
        memo,
        category_id: onlyCatId,
        cleared: "uncleared",
        approved: false,
        import_id: importId,
      });
    } else {
      const subtransactions: YnabSubTransaction[] = Array.from(catAmounts.entries()).map(
        ([category_id, amount]) => ({ amount, category_id, memo: null })
      );
      transactions.push({
        account_id: accountId,
        date: dateStr,
        amount: totalMilli,
        payee_name: payee,
        memo: memo || `Order ${dateStr} (split)`,
        category_id: null,
        cleared: "uncleared",
        approved: false,
        import_id: importId,
        subtransactions,
      });
    }
  }

  if (transactions.length === 0) {
    return {
      imported: 0,
      skippedDuplicates,
      skippedWithinFile: 0,
      skippedZeroAmount,
      apiDuplicates: 0,
      errors: [],
    };
  }

  // 6. POST to YNAB
  const createRes = await ynabFetch<{
    data: {
      transactions?: unknown[];
      duplicate_import_ids?: string[];
    };
  }>(token, `/budgets/${budgetId}/transactions`, {
    method: "POST",
    body: JSON.stringify({ transactions }),
  });

  const created = createRes.data.transactions?.length ?? 0;
  const apiDuplicates = createRes.data.duplicate_import_ids?.length ?? 0;

  return {
    imported: created,
    skippedDuplicates,
    skippedWithinFile: 0,
    skippedZeroAmount,
    apiDuplicates,
    errors: [],
  };
}
