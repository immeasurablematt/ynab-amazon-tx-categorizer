/**
 * Categorization engine: keyword-based + AI via backend API.
 * Ported from lib/normalize.ts (keywords) and amazon_csv_to_ynab.py (AI).
 */
import type { CsvRow, CategoryRule, YnabCategory } from "./types";
import { getCategoryRules, getLearnedMappings } from "./storage";

const DEFAULT_CATEGORY = "Uncategorized";
const BACKEND_URL = "https://ynab-automation.vercel.app";

// ── Keyword categorization ──

/**
 * Categorize a single memo using keyword rules + learned mappings.
 * Returns the category name, or "Uncategorized" if no match.
 */
export async function categorizeByKeywords(
  memo: string,
  customRules?: CategoryRule[]
): Promise<string> {
  const m = (memo || "").toLowerCase();

  // 1. Check learned mappings first (user corrections take priority)
  const learned = await getLearnedMappings();
  for (const [substring, category] of Object.entries(learned)) {
    if (m.includes(substring)) return category;
  }

  // 2. Check keyword rules
  const rules = customRules ?? (await getCategoryRules());
  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (m.includes(kw.toLowerCase())) return rule.category;
    }
  }

  return DEFAULT_CATEGORY;
}

/**
 * Apply keyword categorization to all rows that are still "Uncategorized".
 */
export async function categorizeAllByKeywords(rows: CsvRow[]): Promise<CsvRow[]> {
  const rules = await getCategoryRules();
  const learned = await getLearnedMappings();

  return Promise.all(
    rows.map(async (row) => {
      if (row.Category && row.Category !== DEFAULT_CATEGORY) return row;
      const category = await categorizeByKeywords(row.Memo, rules);
      return { ...row, Category: category };
    })
  );
}

// ── AI categorization (via backend) ──

/**
 * Categorize items using the backend AI endpoint.
 * Falls back to keyword categorization if the backend call fails.
 */
export async function categorizeWithAI(
  rows: CsvRow[],
  categories: YnabCategory[],
): Promise<CsvRow[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/categorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows,
        categories: categories.map((c) => c.name),
      }),
    });
    if (!res.ok) throw new Error(`Backend error ${res.status}`);
    const data = (await res.json()) as { rows?: CsvRow[]; error?: string };
    if (data.error || !data.rows) throw new Error(data.error ?? "No rows returned");
    return data.rows;
  } catch (e) {
    console.warn("Backend categorization failed, falling back to keywords:", e);
    return categorizeAllByKeywords(rows);
  }
}
