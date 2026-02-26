import { NextResponse } from "next/server";

const BATCH_SIZE = 25;

interface CategorizeRequest {
  items: { index: number; memo: string }[];
  categories: string[];
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured on server" },
      { status: 500 }
    );
  }

  let body: CategorizeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { items, categories } = body;
  if (!items?.length || !categories?.length) {
    return NextResponse.json(
      { error: "items and categories arrays are required" },
      { status: 400 }
    );
  }

  try {
    const result: Record<number, string> = {};

    // Process in batches
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const mappings = await callAnthropic(batch, categories, apiKey);
      Object.assign(result, mappings);
    }

    return NextResponse.json({ mappings: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Categorization failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function callAnthropic(
  items: { index: number; memo: string }[],
  categoryNames: string[],
  apiKey: string
): Promise<Record<number, string>> {
  const categoryList = categoryNames.map((c) => `- ${c}`).join("\n");

  let itemsText = "";
  for (const item of items) {
    itemsText += `${item.index}. ${item.memo.slice(0, 300)}\n`;
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
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text: string }[];
  };

  let responseText = data.content[0]?.text?.trim() ?? "{}";
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
