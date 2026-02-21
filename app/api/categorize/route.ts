import { NextResponse } from "next/server";

interface CsvRow {
  Date: string;
  Payee: string;
  Memo: string;
  Amount: number;
  Category: string;
  OrderId?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const DEFAULT_CATEGORY = "Uncategorized";
const BATCH_SIZE = 25;

// Handle OPTIONS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI categorization not configured" },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  let body: { rows?: CsvRow[]; categories?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { rows, categories } = body;

  if (!rows?.length || !categories?.length) {
    return NextResponse.json(
      { error: "Missing rows or categories" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const result = [...rows];

    for (let i = 0; i < result.length; i += BATCH_SIZE) {
      const batchStart = i;
      const batch = result.slice(batchStart, batchStart + BATCH_SIZE);

      const uncategorized: CsvRow[] = [];
      const uncategorizedGlobalIndices: number[] = [];

      batch.forEach((row, localIdx) => {
        if (!row.Category || row.Category === DEFAULT_CATEGORY) {
          uncategorized.push(row);
          uncategorizedGlobalIndices.push(batchStart + localIdx);
        }
      });

      if (uncategorized.length === 0) continue;

      const mappings = await callAnthropic(uncategorized, categories, apiKey);

      uncategorized.forEach((_, idx) => {
        const globalIdx = uncategorizedGlobalIndices[idx];
        const aiCategory = mappings[idx];
        if (aiCategory) {
          result[globalIdx] = {
            ...result[globalIdx],
            Category: resolveCategory(aiCategory, categories),
          };
        }
      });
    }

    return NextResponse.json({ rows: result }, { headers: CORS_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Categorization failed";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

/**
 * Call Anthropic Messages API server-side.
 * Returns: { [itemIndex]: categoryName }
 */
async function callAnthropic(
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
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
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
    responseText = responseText
      .replace(/```json?\s*/g, "")
      .replace(/```\s*$/g, "");
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

  // Normalize: strip emoji
  const normalize = (s: string): string =>
    s
      .replace(
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}]/gu,
        ""
      )
      .trim()
      .toLowerCase();

  const aiNorm = normalize(trimmed);

  for (const cat of validCategories) {
    if (normalize(cat) === aiNorm) return cat;
  }
  for (const cat of validCategories) {
    if (aiNorm.includes(normalize(cat)) || normalize(cat).includes(aiNorm))
      return cat;
  }

  return DEFAULT_CATEGORY;
}
