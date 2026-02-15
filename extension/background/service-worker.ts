/**
 * Manifest V3 service worker: routes messages between popup, content script,
 * and external APIs (YNAB, Anthropic).
 */

const YNAB_BASE = "https://api.ynab.com/v1";

// ── Message handler ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // All handlers return true to indicate async response
  switch (message.type) {
    case "FETCH_BUDGETS":
      handleFetchBudgets(message.payload).then(sendResponse);
      return true;

    case "FETCH_ACCOUNTS":
      handleFetchAccounts(message.payload).then(sendResponse);
      return true;

    case "SCRAPE_ORDERS":
      handleScrapeOrders().then(sendResponse);
      return true;

    case "PARSE_CSV":
      handleParseCsv(message.payload).then(sendResponse);
      return true;

    case "IMPORT":
      handleImport(message.payload).then(sendResponse);
      return true;

    case "CONTENT_SCRIPT_READY":
      // Update badge when content script loads on Amazon page
      if (sender.tab?.id) {
        chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
        chrome.action.setBadgeText({ text: "!", tabId: sender.tab.id });
      }
      return false;
  }
});

// ── YNAB fetch helpers ──

async function ynabFetch(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${YNAB_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: { detail?: string } }).error?.detail ??
        `YNAB API error: ${res.status}`
    );
  }
  return res.json();
}

// ── Handlers ──

async function handleFetchBudgets(
  payload: { token: string }
): Promise<{ budgets?: { id: string; name: string }[]; error?: string }> {
  try {
    const data = (await ynabFetch(payload.token, "/budgets")) as {
      data: { budgets: { id: string; name: string }[] };
    };
    return {
      budgets: data.data.budgets.map((b) => ({ id: b.id, name: b.name })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to fetch budgets" };
  }
}

async function handleFetchAccounts(
  payload: { token: string; budgetId: string }
): Promise<{ accounts?: { id: string; name: string }[]; error?: string }> {
  try {
    const data = (await ynabFetch(
      payload.token,
      `/budgets/${payload.budgetId}/accounts`
    )) as {
      data: {
        accounts: { id: string; name: string; closed: boolean; deleted: boolean }[];
      };
    };
    return {
      accounts: data.data.accounts
        .filter((a) => !a.closed && !a.deleted)
        .map((a) => ({ id: a.id, name: a.name })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to fetch accounts" };
  }
}

async function handleScrapeOrders(): Promise<{
  orders?: unknown[];
  error?: string;
}> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) {
      return { error: "No active tab" };
    }
    if (
      !tab.url?.includes("amazon.ca") &&
      !tab.url?.includes("amazon.com")
    ) {
      return { error: "Not on an Amazon page. Navigate to your order history first." };
    }

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "SCRAPE_ORDERS",
    });
    if (response.error) {
      return { error: response.error };
    }

    // Convert scraped orders to CsvRow format
    const orders = (response.orders ?? []).flatMap(
      (order: {
        orderId: string;
        date: string;
        total: number;
        items: { title: string; price: number | null }[];
      }) =>
        order.items.map((item) => ({
          Date: order.date,
          Payee: "Amazon.ca",
          Memo: item.title,
          Amount: -(item.price ?? order.total),
          Category: "Uncategorized",
          OrderId: order.orderId,
        }))
    );

    return { orders };
  } catch {
    return { error: "Could not connect to Amazon page. Try refreshing." };
  }
}

async function handleParseCsv(
  payload: { csvText: string }
): Promise<{ orders?: unknown[]; error?: string }> {
  // Minimal CSV parsing for the service worker context.
  // Phase 2 will add the full normalizeAmazonCsv port with Papa Parse.
  try {
    const lines = payload.csvText.trim().split("\n");
    if (lines.length < 2) return { error: "CSV has no data rows" };

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const dateIdx = headers.findIndex((h) =>
      ["date", "order date", "order.date"].includes(h)
    );
    const amountIdx = headers.findIndex((h) =>
      ["amount", "total", "order total", "item total"].includes(h)
    );
    const memoIdx = headers.findIndex((h) =>
      ["memo", "title", "item title", "description", "product"].includes(h)
    );

    if (dateIdx === -1 || amountIdx === -1) {
      return { error: "Could not find Date and Amount columns in CSV" };
    }

    const orders = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const date = cols[dateIdx] ?? "";
      const amount = parseFloat((cols[amountIdx] ?? "0").replace(/[$,]/g, ""));
      const memo = cols[memoIdx] ?? "";
      if (!date || isNaN(amount)) continue;
      orders.push({
        Date: date,
        Payee: "Amazon.ca",
        Memo: memo,
        Amount: amount > 0 ? -amount : amount,
        Category: "Uncategorized",
      });
    }
    return { orders };
  } catch {
    return { error: "Failed to parse CSV" };
  }
}

async function handleImport(
  rows: {
    Date: string;
    Payee: string;
    Memo: string;
    Amount: number;
    Category: string;
    OrderId?: string;
  }[]
): Promise<{ result?: unknown; error?: string }> {
  // Placeholder: Phase 2 will implement the full YNAB import with
  // duplicate detection, category mapping, and split transactions.
  try {
    const { settings } = await chrome.storage.local.get("settings");
    if (!settings?.ynabToken || !settings?.budgetId || !settings?.accountId) {
      return { error: "YNAB credentials not configured. Open Settings." };
    }

    // For now, just validate that the API is reachable
    const res = await fetch(
      `${YNAB_BASE}/budgets/${settings.budgetId}/accounts/${settings.accountId}`,
      { headers: { Authorization: `Bearer ${settings.ynabToken}` } }
    );
    if (!res.ok) {
      return { error: `YNAB API error: ${res.status}` };
    }

    return {
      result: {
        imported: 0,
        skippedDuplicates: 0,
        skippedWithinFile: 0,
        skippedZeroAmount: 0,
        apiDuplicates: 0,
        errors: ["Import not yet implemented — Phase 2 will add this."],
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import failed" };
  }
}
