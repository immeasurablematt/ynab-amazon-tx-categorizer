import { NextResponse } from "next/server";
import * as ynab from "ynab";
import { ynabReadyToJson } from "@/lib/normalize";

const DAYS_TOLERANCE = parseInt(process.env.YNAB_DUPLICATE_DAYS || "5", 10);

export async function POST(request: Request) {
  const token = process.env.YNAB_ACCESS_TOKEN;
  const budgetId = process.env.YNAB_BUDGET_ID;
  const accountId = process.env.YNAB_ACCOUNT_ID;

  if (!token || !budgetId || !accountId) {
    return NextResponse.json(
      { error: "Missing YNAB_ACCESS_TOKEN, YNAB_BUDGET_ID, or YNAB_ACCOUNT_ID in environment" },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const text = await file.text();
    const csvRows = ynabReadyToJson(text);

    if (csvRows.length === 0) {
      return NextResponse.json({
        imported: 0,
        skippedDuplicates: 0,
        error: "No valid rows in CSV",
      });
    }

    const api = new ynab.API(token);

    // Fetch categories
    const catRes = await api.categories.getCategories(budgetId);
    const categoryIdMap: Record<string, string> = {};
    for (const group of catRes.data.category_groups || []) {
      for (const cat of group.categories || []) {
        if (!cat.deleted && !cat.hidden) {
          categoryIdMap[(cat.name || "").toLowerCase()] = cat.id!;
        }
      }
    }

    // Min date for duplicate check
    const minDate = csvRows.reduce(
      (a, r) => (r.Date < a ? r.Date : a),
      csvRows[0].Date
    );
    const sinceDate = new Date(minDate);
    sinceDate.setDate(sinceDate.getDate() - DAYS_TOLERANCE);

    // Fetch existing transactions
    const existingRes = await api.transactions.getTransactionsByAccount(
      budgetId,
      accountId,
      sinceDate.toISOString().slice(0, 10)
    );

    const existingByAmount: Record<number, string[]> = {};
    for (const tx of existingRes.data.transactions || []) {
      if (tx.amount == null || !tx.date) continue;
      const dt = typeof tx.date === "string" ? tx.date.slice(0, 10) : "";
      if (!dt) continue;
      if (!existingByAmount[tx.amount]) existingByAmount[tx.amount] = [];
      existingByAmount[tx.amount].push(dt);
    }

    function isDuplicate(importDate: string, importAmount: number): boolean {
      const amt = Math.round(importAmount * 1000);
      const dates = existingByAmount[amt];
      if (!dates) return false;
      const imp = new Date(importDate);
      for (const d of dates) {
        const ex = new Date(d);
        const diff = Math.abs((imp.getTime() - ex.getTime()) / (1000 * 60 * 60 * 24));
        if (diff <= DAYS_TOLERANCE) return true;
      }
      return false;
    }

    const transactions: ynab.NewTransaction[] = [];
    let skippedDuplicates = 0;

    for (const row of csvRows) {
      const amountMilli = Math.round(row.Amount * 1000);
      const dateObj = new Date(row.Date);
      const dateStr = dateObj.toISOString().slice(0, 10);

      if (isDuplicate(row.Date, row.Amount)) {
        skippedDuplicates++;
        continue;
      }

      const categoryId =
        row.Category && categoryIdMap[row.Category.toLowerCase()]
          ? categoryIdMap[row.Category.toLowerCase()]
          : null;

      transactions.push({
        account_id: accountId,
        date: dateStr,
        amount: amountMilli,
        payee_name: row.Payee || "Amazon.ca",
        memo: row.Memo || null,
        category_id: categoryId,
        cleared: "uncleared",
        approved: false,
      });
    }

    if (transactions.length === 0) {
      return NextResponse.json({
        imported: 0,
        skippedDuplicates,
        existingLoaded: Object.values(existingByAmount).flat().length,
      });
    }

    const createRes = await api.transactions.createTransaction(budgetId, {
      transactions,
    });

    const created = createRes.data.transactions?.length ?? 0;
    const apiDuplicates = createRes.data.duplicate_import_ids?.length ?? 0;

    return NextResponse.json({
      imported: created,
      skippedDuplicates,
      apiDuplicates,
      existingLoaded: Object.values(existingByAmount).flat().length,
    });
  } catch (e: unknown) {
    const err = e as { error?: { detail?: string }; message?: string };
    const msg =
      err?.error?.detail || err?.message || (e instanceof Error ? e.message : "Import failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
