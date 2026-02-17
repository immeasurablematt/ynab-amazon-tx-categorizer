import React, { useEffect, useRef, useState } from "react";
import { getCategories, saveLearnedMapping } from "@lib/storage";
import type { CsvRow, YnabCategory } from "@lib/types";

interface Props {
  orders: CsvRow[];
  setOrders: (orders: CsvRow[]) => void;
}

export function ReviewView({ orders, setOrders }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [categories, setCategories] = useState<YnabCategory[]>([]);

  // Load cached categories for the dropdown
  useEffect(() => {
    getCategories().then((cats) => {
      if (cats.length > 0) {
        setCategories(cats);
      } else {
        // Try syncing from YNAB
        chrome.runtime.sendMessage({ type: "SYNC_CATEGORIES" }).then((res) => {
          if (res.categories) setCategories(res.categories);
        }).catch(() => {});
      }
    });
  }, []);

  const handleScrape = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const response = await chrome.runtime.sendMessage({ type: "SCRAPE_ORDERS" });
      if (response.error) {
        setStatus({ type: "error", text: response.error });
      } else if (response.orders) {
        setOrders(response.orders);
        setStatus({ type: "success", text: `Found ${response.orders.length} transactions` });
      }
    } catch {
      setStatus({ type: "error", text: "Not on an Amazon order page" });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setStatus(null);
    try {
      const text = await file.text();
      const response = await chrome.runtime.sendMessage({
        type: "PARSE_CSV",
        payload: { csvText: text },
      });
      if (response.error) {
        setStatus({ type: "error", text: response.error });
      } else if (response.orders) {
        setOrders(response.orders);
        setStatus({ type: "success", text: `Parsed ${response.orders.length} transactions` });
      }
    } catch {
      setStatus({ type: "error", text: "Failed to parse CSV" });
    } finally {
      setLoading(false);
      // Reset file input so the same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCategorize = async () => {
    setCategorizing(true);
    setStatus(null);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "CATEGORIZE",
        payload: orders,
      });
      if (response.error) {
        setStatus({ type: "error", text: response.error });
      } else if (response.orders) {
        setOrders(response.orders);
        const changed = response.orders.filter(
          (o: CsvRow, i: number) => o.Category !== orders[i]?.Category
        ).length;
        setStatus({ type: "success", text: `Categorized ${changed} items` });
      }
    } catch {
      setStatus({ type: "error", text: "Categorization failed" });
    } finally {
      setCategorizing(false);
    }
  };

  const handleCategoryChange = async (index: number, newCategory: string) => {
    const updated = [...orders];
    const old = updated[index];
    updated[index] = { ...old, Category: newCategory };
    setOrders(updated);

    // Learn this mapping for future use (first 60 chars of memo)
    const key = old.Memo.slice(0, 60).toLowerCase();
    if (key && newCategory !== "Uncategorized") {
      await saveLearnedMapping(key, newCategory);
    }
  };

  const handleRemoveRow = (index: number) => {
    setOrders(orders.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "IMPORT",
        payload: orders,
      });
      if (response.error) {
        setStatus({ type: "error", text: response.error });
      } else {
        const r = response.result;
        const parts = [`Imported ${r.imported}`];
        if (r.skippedDuplicates > 0) parts.push(`${r.skippedDuplicates} dupes skipped`);
        if (r.apiDuplicates > 0) parts.push(`${r.apiDuplicates} API dupes`);
        setStatus({ type: "success", text: parts.join(" | ") });
        if (r.imported > 0) setOrders([]);
      }
    } catch {
      setStatus({ type: "error", text: "Import failed" });
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number) => {
    const formatted = Math.abs(amount).toFixed(2);
    return amount < 0 ? `-$${formatted}` : `$${formatted}`;
  };

  const uncategorizedCount = orders.filter(
    (o) => !o.Category || o.Category === "Uncategorized"
  ).length;

  // Build category options: unique names from YNAB categories
  const categoryOptions = categories.length > 0
    ? [...new Set(categories.map((c) => c.name))].sort()
    : [...new Set(orders.map((o) => o.Category).filter(Boolean))].sort();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Actions row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={handleScrape} disabled={loading}>
          {loading && !categorizing ? <span className="spinner" /> : "Scrape Page"}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          Upload CSV
        </button>
        {orders.length > 0 && (
          <button
            className="btn btn-secondary"
            onClick={handleCategorize}
            disabled={categorizing || loading}
            title="Re-categorize using AI (if configured) or keyword rules"
          >
            {categorizing ? <span className="spinner" /> : "Categorize"}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          style={{ display: "none" }}
        />
      </div>

      {/* Status */}
      {status && (
        <div className={`status-badge ${status.type}`}>{status.text}</div>
      )}

      {/* Uncategorized warning */}
      {uncategorizedCount > 0 && orders.length > 0 && (
        <div className="status-badge warning">
          {uncategorizedCount} item{uncategorizedCount !== 1 ? "s" : ""} uncategorized
        </div>
      )}

      {/* Order list or empty state */}
      {orders.length === 0 ? (
        <div className="empty-state">
          <p>No orders loaded.</p>
          <p>Navigate to your Amazon order history and click "Scrape Page", or upload a CSV file.</p>
        </div>
      ) : (
        <>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            <table className="order-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Amount</th>
                  <th>Category</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: "nowrap", fontSize: 11 }}>{o.Date}</td>
                    <td
                      style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={o.Memo}
                    >
                      {o.Memo}
                    </td>
                    <td className={o.Amount < 0 ? "amount-negative" : "amount-positive"} style={{ whiteSpace: "nowrap" }}>
                      {formatAmount(o.Amount)}
                    </td>
                    <td>
                      {categoryOptions.length > 0 ? (
                        <select
                          value={o.Category || "Uncategorized"}
                          onChange={(e) => handleCategoryChange(i, e.target.value)}
                          className={o.Category === "Uncategorized" || !o.Category ? "category-uncategorized" : ""}
                          style={{
                            background: "#1e293b",
                            color: (!o.Category || o.Category === "Uncategorized") ? "#fbbf24" : "#e2e8f0",
                            border: "1px solid #334155",
                            borderRadius: 4,
                            padding: "2px 4px",
                            fontSize: 11,
                            maxWidth: 120,
                          }}
                        >
                          <option value="Uncategorized">Uncategorized</option>
                          {categoryOptions.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={o.Category === "Uncategorized" ? "category-uncategorized" : ""}>
                          {o.Category || "Uncategorized"}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => handleRemoveRow(i)}
                        title="Remove"
                        style={{
                          background: "none",
                          border: "none",
                          color: "#64748b",
                          cursor: "pointer",
                          fontSize: 14,
                          padding: "0 4px",
                        }}
                      >
                        x
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            className="btn btn-primary btn-full"
            onClick={handleImport}
            disabled={loading || orders.length === 0}
          >
            {loading && !categorizing ? <span className="spinner" /> : `Import ${orders.length} to YNAB`}
          </button>
        </>
      )}
    </div>
  );
}
