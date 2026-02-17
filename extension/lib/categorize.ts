/**
 * Categorization engine: keyword-based + optional AI (Anthropic Claude).
 * Ported from lib/normalize.ts (keywords) and amazon_csv_to_ynab.py (AI).
 */
import type { CsvRow, CategoryRule, YnabCategory } from "./types";
import { getCategoryRules, getLearnedMappings } from "./storage";

const DEFAULT_CATEGORY = "Uncategorized";

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

// ── AI categorization (Anthropic Claude) ──

const BATCH_SIZE = 25;

/**
 * Categorize items using Claude AI.
 * Requires an Anthropic API key. Falls back to keyword categorization if unavailable.
 */
export async function categorizeWithAI(
  rows: CsvRow[],
  categories: YnabCategory[],
  anthropicKey: string
): Promise<CsvRow[]> {
  if (!anthropicKey) {
    return categorizeAllByKeywords(rows);
  }

  const categoryNames = categories.map((c) => c.name);
  const result = [...rows];

  // Process in batches to stay within token limits
  for (let i = 0; i < result.length; i += BATCH_SIZE) {
    const batch = result.slice(i, i + BATCH_SIZE);
    const uncategorized = batch.filter(
      (r) => !r.Category || r.Category === DEFAULT_CATEGORY
    );

    if (uncategorized.length === 0) continue;

    try {
      const mappings = await callAnthropicAPI(uncategorized, categoryNames, anthropicKey);

      // Apply AI results
      let batchIdx = 0;
      for (let j = i; j < Math.min(i + BATCH_SIZE, result.length); j++) {
        if (!result[j].Category || result[j].Category === DEFAULT_CATEGORY) {
          const aiCategory = mappings[batchIdx];
          if (aiCategory) {
            result[j] = {
              ...result[j],
              Category: resolveCategory(aiCategory, categoryNames),
            };
          }
          batchIdx++;
        }
      }
    } catch (e) {
      console.warn("AI categorization batch failed, falling back to keywords:", e);
      // Fall back to keyword categorization for this batch
      for (let j = i; j < Math.min(i + BATCH_SIZE, result.length); j++) {
        if (!result[j].Category || result[j].Category === DEFAULT_CATEGORY) {
          result[j] = {
            ...result[j],
            Category: await categorizeByKeywords(result[j].Memo),
          };
        }
      }
    }
  }

  return result;
}

/**
 * Call Anthropic Messages API directly via fetch().
 * Returns: { [itemIndex]: categoryName }
 */
async function callAnthropicAPI(
  items: CsvRow[],
  categoryNames: string[],
  apiKey: string
): Promise<Record<number, string>> {
  const categoryList = categoryNames.map((c) => `- ${c}`).join("\n");

  let itemsText = "";
  for (let i = 0; i < items.length; i++) {
    itemsText += `${i}. ${items[i].Memo.slice(0, 300)}\n`;
  }

  const prompt = `You are a budget categorization assistant. For each Amazon purchase below, determine the most appropriate budget category based on what the product actually is.

AVAILABLE CATEGORIES:
${categoryList}

ITEMS TO CATEGORIZE:
${itemsText}

INSTRUCTIONS:
1. Understand what each product actually is (not just keyword matching)
2. Consider the context:
   - Kids clothing, toys, books for children → "Kids Supplies"
   - Adult clothing, shoes, accessories → "Wardrobe"
   - Movie rentals, streaming → "Family Fun & Dates" or "Subscriptions (Monthly)" for recurring
   - Health supplements, vitamins for adults → "Medicine & Vitamins"
   - Books for personal reading (adult fiction/non-fiction) → owner's Fun Money category or appropriate
   - Light fixtures, sconces, bulbs → "Light Fixtures" if available, else "Home Maintenance & Decor"
   - Coffee tables, ottomans → "Coffee Table & Side Tables" if available, else "Home Maintenance & Decor"
   - Cleaning supplies, kitchenware, tools → "Home Maintenance & Decor"
   - Subscription services (Apple TV+, Prime Video ad-free, media apps) → "Subscriptions (Monthly)"
   - Gift cards → "Gifts & Giving"
   - Spiritual/Buddhist books → "Retreats"
   - Tech gadgets (chargers, mice, electronics for personal use) → owner's Fun Money or appropriate
   - UGG slippers, shoes, footwear → "Wardrobe"
   - Beverages, water enhancers, drink mixes → "Groceries"
   - Mixed orders (book + kids product) → pick the category of the higher-value item
3. For mixed orders (multiple items), pick the category of the highest-value or primary item
4. If truly uncertain, use "Uncategorized"

Return ONLY a JSON object mapping item index to category name.
CRITICAL: You MUST use the EXACT category name from the list above, including any emojis.
Example:
{"0": "Kids Supplies", "1": "Wardrobe", "2": "Groceries"}

JSON response:`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text: string }[];
  };

  let responseText = data.content[0]?.text?.trim() ?? "{}";

  // Handle markdown code blocks
  if (responseText.startsWith("```")) {
    responseText = responseText.replace(/```json?\s*/g, "").replace(/```\s*$/g, "");
  }

  const parsed = JSON.parse(responseText) as Record<string, string>;
  const result: Record<number, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    result[parseInt(k, 10)] = v;
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
