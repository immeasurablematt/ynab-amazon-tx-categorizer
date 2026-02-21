import type {
  ExtensionSettings,
  YnabCategory,
  CsvRow,
  CategoryRule,
} from "./types";

// ── Default values ──

const DEFAULT_SETTINGS: ExtensionSettings = {
  ynabToken: "",
  budgetId: "",
  budgetName: "",
  accountId: "",
  accountName: "",
  defaultPayee: "Amazon.ca",
  amazonDomain: "amazon.ca",
  duplicateDaysTolerance: 5,
};

const DEFAULT_CATEGORY_RULES: CategoryRule[] = [
  { keywords: ["kid", "baby", "toddler", "diaper", "crib", "stroller", "toy", "magnetic tiles"], category: "Kids Supplies" },
  { keywords: ["filter", "furniture", "ottoman", "coffee table", "light bulb", "dimmer", "screwdriver", "scissors", "bed rail"], category: "Home Maintenance & Decor" },
  { keywords: ["cerave", "baby wash", "shampoo", "skincare", "makeup", "soap"], category: "Personal Care" },
  { keywords: ["slipper", "ugg", "shoes", "clothes", "gaiters"], category: "Wardrobe" },
  { keywords: ["prime video", "ad free", "subscription", "appstore", "vimu"], category: "Subscriptions (Monthly)" },
  { keywords: ["gift card", "egift", "gingerbread"], category: "Gifts & Giving" },
  { keywords: ["buddhism", "vajrayana", "dangerous friend", "dharma"], category: "Retreats" },
  { keywords: ["gym", "phone holder", "fitness", "coaching"], category: "Fitness & Coaching" },
  { keywords: ["glad", "garbage bag", "grocer"], category: "Groceries" },
];

// ── Storage keys ──

const KEYS = {
  settings: "settings",
  categories: "ynab_categories",
  categoryRules: "category_rules",
  learnedMappings: "learned_mappings",
  pendingOrders: "pending_orders",
} as const;

// ── Generic helpers ──

function get<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] as T | undefined);
    });
  });
}

function set(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

// ── Settings ──

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await get<Partial<ExtensionSettings>>(KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(
  settings: Partial<ExtensionSettings>
): Promise<ExtensionSettings> {
  const current = await getSettings();
  const merged = { ...current, ...settings };
  await set(KEYS.settings, merged);
  return merged;
}

export async function isConfigured(): Promise<boolean> {
  const s = await getSettings();
  return !!(s.ynabToken && s.budgetId && s.accountId);
}

// ── YNAB Categories (cached from API) ──

export async function getCategories(): Promise<YnabCategory[]> {
  return (await get<YnabCategory[]>(KEYS.categories)) ?? [];
}

export async function saveCategories(
  categories: YnabCategory[]
): Promise<void> {
  await set(KEYS.categories, categories);
}

// ── Category Rules (keyword mappings) ──

export async function getCategoryRules(): Promise<CategoryRule[]> {
  const stored = await get<CategoryRule[]>(KEYS.categoryRules);
  return stored ?? DEFAULT_CATEGORY_RULES;
}

export async function saveCategoryRules(
  rules: CategoryRule[]
): Promise<void> {
  await set(KEYS.categoryRules, rules);
}

// ── Learned Mappings (user corrections: memo substring → category) ──

export async function getLearnedMappings(): Promise<
  Record<string, string>
> {
  return (await get<Record<string, string>>(KEYS.learnedMappings)) ?? {};
}

export async function saveLearnedMapping(
  memoSubstring: string,
  category: string
): Promise<void> {
  const current = await getLearnedMappings();
  current[memoSubstring.toLowerCase()] = category;
  await set(KEYS.learnedMappings, current);
}

// ── Pending Orders (scraped, awaiting review/import) ──

export async function getPendingOrders(): Promise<CsvRow[]> {
  return (await get<CsvRow[]>(KEYS.pendingOrders)) ?? [];
}

export async function savePendingOrders(orders: CsvRow[]): Promise<void> {
  await set(KEYS.pendingOrders, orders);
}

export async function clearPendingOrders(): Promise<void> {
  await set(KEYS.pendingOrders, []);
}
