/**
 * Categorization engine: keyword-based + AI via server-side proxy.
 * AI calls go through the Vercel API (no API keys in the browser).
 */
import type { CsvRow, CategoryRule, YnabCategory } from "./types";
import { getCategoryRules, getLearnedMappings } from "./storage";

const DEFAULT_CATEGORY = "Uncategorized";
const CATEGORIZE_API = "https://ynab-automation.vercel.app/api/categorize";

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

// ── AI categorization (via server-side proxy) ──

/**
 * Categorize items using AI via the Vercel API proxy.
 * Falls back to keyword categorization if the API is unavailable.
 */
export async function categorizeWithAI(
  rows: CsvRow[],
  categories: YnabCategory[]
): Promise<CsvRow[]> {
  const categoryNames = categories.map((c) => c.name);
  const result = [...rows];

  // Collect uncategorized items with their original indices
  const uncategorized: { resultIndex: number; memo: string }[] = [];
  for (let i = 0; i < result.length; i++) {
    if (!result[i].Category || result[i].Category === DEFAULT_CATEGORY) {
      uncategorized.push({ resultIndex: i, memo: result[i].Memo });
    }
  }

  if (uncategorized.length === 0) return result;

  try {
    const res = await fetch(CATEGORIZE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: uncategorized.map((u, i) => ({ index: i, memo: u.memo })),
        categories: categoryNames,
      }),
    });

    if (!res.ok) {
      throw new Error(`API error ${res.status}`);
    }

    const data = (await res.json()) as { mappings: Record<number, string> };

    for (let i = 0; i < uncategorized.length; i++) {
      const aiCategory = data.mappings[i];
      if (aiCategory) {
        const idx = uncategorized[i].resultIndex;
        result[idx] = {
          ...result[idx],
          Category: resolveCategory(aiCategory, categoryNames),
        };
      }
    }
  } catch (e) {
    console.warn("AI categorization failed, falling back to keywords:", e);
    for (const u of uncategorized) {
      result[u.resultIndex] = {
        ...result[u.resultIndex],
        Category: await categorizeByKeywords(result[u.resultIndex].Memo),
      };
    }
  }

  return result;
}

/**
 * Fuzzy-match an AI response to a valid category name.
 * Handles emoji/whitespace differences.
 */
function resolveCategory(aiResponse: string, validCategories: string[]): string {
  const trimmed = (aiResponse || "").trim();

  // Exact match
  if (validCategories.includes(trimmed)) return trimmed;

  // Normalize: strip emoji (Supplementary characters + Symbol,Other category)
  const normalize = (s: string): string =>
    s
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}]/gu, "")
      .trim()
      .toLowerCase();

  const aiNorm = normalize(trimmed);

  for (const cat of validCategories) {
    if (normalize(cat) === aiNorm) return cat;
  }
  for (const cat of validCategories) {
    if (aiNorm.includes(normalize(cat)) || normalize(cat).includes(aiNorm)) return cat;
  }

  return DEFAULT_CATEGORY;
}
