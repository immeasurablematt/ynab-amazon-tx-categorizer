import React, { useEffect, useState } from "react";
import { getCategories, saveLearnedMapping } from "@lib/storage";
import type { MatchResult, MatchedTransaction, YnabCategory } from "@lib/types";

export function MatchView() {
  const [sinceDate, setSinceDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [categories, setCategories] = useState<YnabCategory[]>([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    getCategories().then((cats) => {
      if (cats.length > 0) {
        setCategories(cats);
      } else {
        chrome.runtime.sendMessage({ type: "SYNC_CATEGORIES" }).then((res) => {
          if (res.categories) setCategories(res.categories);
        }).catch(() => {});
      }
    });
  }, []);

  const categoryOptions = categories.length > 0
    ? [...new Set(categories.map((c) => c.name))].sort()
    : [];

  const categoryIdMap: Record<string, string> = {};
  for (const cat of categories) {
    categoryIdMap[cat.name.toLowerCase()] = cat.id;
  }

  const handleSync = async () => {
    setLoading(true);
    setStatus(null);
    setResult(null);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "MATCH_AND_CATEGORIZE",
        payload: { sinceDate },
      });
      if (response.error) {
        setStatus({ type: "error", text: response.error });
      } else if (response.result) {
        const r = response.result as MatchResult;
        setResult(r);
        if (r.matched.length === 0) {
          setStatus({ type: "info", text: `No matches. ${r.unmatchedOrders.length} orders, ${r.unmatchedTransactions.length} YNAB transactions unmatched.` });
        } else {
          setStatus({ type: "success", text: `${r.matched.length} matched, ${r.unmatchedOrders.length} unmatched orders` });
        }
      }
    } catch {
      setStatus({ type: "error", text: "Could not connect to Amazon page. Try refreshing." });
    } finally {
      setLoading(false);
    }
  };

  const toggleApproval = (index: number) => {
    if (!result) return;
    const updated = [...result.matched];
    updated[index] = { ...updated[index], approved: !updated[index].approved };
    setResult({ ...result, matched: updated });
  };

  const handleCategoryChange = async (index: number, newCategory: string) => {
    if (!result) return;
    const updated = [...result.matched];
    updated[index] = {
      ...updated[index],
      suggestedCategory: newCategory,
      suggestedCategoryId: categoryIdMap[newCategory.toLowerCase()] ?? "",
    };
    setResult({ ...result, matched: updated });

    // Learn mapping from the highest-value item title
    const item = updated[index].order.items[0];
    if (item && newCategory !== "Uncategorized") {
      const key = item.title.slice(0, 60).toLowerCase();
      if (key) await saveLearnedMapping(key, newCategory);
    }
  };

  const handleApply = async () => {
    if (!result) return;
    const approved = result.matched.filter((m) => m.approved && m.suggestedCategoryId);
    if (approved.length === 0) {
      setStatus({ type: "info", text: "No approved matches with valid categories to apply." });
      return;
    }

    setApplying(true);
    setStatus(null);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "UPDATE_TRANSACTION_CATEGORIES",
        payload: {
          updates: approved.map((m) => ({
            id: m.transaction.id,
            category_id: m.suggestedCategoryId,
          })),
        },
      });
      if (response.error) {
        setStatus({ type: "error", text: response.error });
      } else {
        setStatus({ type: "success", text: `Updated ${response.updated} transactions in YNAB` });
        // Remove applied matches from results
        const remaining = result.matched.filter((m) => !m.approved || !m.suggestedCategoryId);
        setResult({ ...result, matched: remaining });
      }
    } catch {
      setStatus({ type: "error", text: "Failed to update YNAB" });
    } finally {
      setApplying(false);
    }
  };

  const formatAmount = (milliunits: number) => {
    const dollars = Math.abs(milliunits) / 1000;
    return `$${dollars.toFixed(2)}`;
  };

  const confidenceClass = (c: string) => {
    if (c === "high") return "confidence-high";
    if (c === "medium") return "confidence-medium";
    return "confidence-ambiguous";
  };

  const approvedCount = result?.matched.filter((m) => m.approved && m.suggestedCategoryId).length ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div className="form-group" style={{ flex: "0 0 auto" }}>
          <label>Since</label>
          <input
            type="date"
            value={sinceDate}
            onChange={(e) => setSinceDate(e.target.value)}
            style={{ width: 130 }}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSync}
          disabled={loading}
          style={{ marginTop: 18 }}
        >
          {loading ? <span className="spinner" /> : "Sync & Match"}
        </button>
      </div>

      {/* Status */}
      {status && (
        <div className={`status-badge ${status.type}`}>{status.text}</div>
      )}

      {/* Match table */}
      {result && result.matched.length > 0 && (
        <>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            <table className="order-table match-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>Date</th>
                  <th>Amazon Item</th>
                  <th>Amount</th>
                  <th>Category</th>
                  <th style={{ width: 24 }}></th>
                </tr>
              </thead>
              <tbody>
                {result.matched.map((m, i) => {
                  const itemTitle = m.order.items.length > 0
                    ? m.order.items[0].title
                    : "Amazon purchase";
                  const itemCount = m.order.items.length;

                  return (
                    <tr key={i} className={m.confidence === "ambiguous" ? "row-ambiguous" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          checked={m.approved}
                          onChange={() => toggleApproval(i)}
                        />
                      </td>
                      <td style={{ whiteSpace: "nowrap", fontSize: 11 }}>{m.order.date}</td>
                      <td
                        style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={m.order.items.map((it) => it.title).join("\n")}
                      >
                        {itemTitle}
                        {itemCount > 1 && (
                          <span style={{ color: "#64748b", fontSize: 10 }}> +{itemCount - 1}</span>
                        )}
                      </td>
                      <td className="amount-negative" style={{ whiteSpace: "nowrap" }}>
                        {formatAmount(m.transaction.amount)}
                      </td>
                      <td>
                        {categoryOptions.length > 0 ? (
                          <select
                            value={m.suggestedCategory || "Uncategorized"}
                            onChange={(e) => handleCategoryChange(i, e.target.value)}
                            className={!m.suggestedCategory || m.suggestedCategory === "Uncategorized" ? "category-uncategorized" : ""}
                            style={{
                              background: "#1e293b",
                              color: (!m.suggestedCategory || m.suggestedCategory === "Uncategorized") ? "#fbbf24" : "#e2e8f0",
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
                          <span className={m.suggestedCategory === "Uncategorized" ? "category-uncategorized" : ""}>
                            {m.suggestedCategory || "Uncategorized"}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`confidence-badge ${confidenceClass(m.confidence)}`} title={`${m.confidence} confidence`}>
                          {m.confidence === "high" ? "H" : m.confidence === "medium" ? "M" : "?"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            className="btn btn-primary btn-full"
            onClick={handleApply}
            disabled={applying || approvedCount === 0}
          >
            {applying ? <span className="spinner" /> : `Apply ${approvedCount} Categories`}
          </button>
        </>
      )}

      {/* Unmatched sections */}
      {result && result.unmatchedOrders.length > 0 && (
        <details className="unmatched-section">
          <summary>{result.unmatchedOrders.length} Amazon orders with no YNAB match</summary>
          <div style={{ maxHeight: 150, overflowY: "auto", marginTop: 4 }}>
            {result.unmatchedOrders.map((o, i) => (
              <div key={i} className="unmatched-row">
                <span>{o.date}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.items[0]?.title}>
                  {o.items[0]?.title ?? "Unknown item"}
                </span>
                <span className="amount-negative">${o.total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {result && result.unmatchedTransactions.length > 0 && (
        <details className="unmatched-section">
          <summary>{result.unmatchedTransactions.length} YNAB transactions with no Amazon match</summary>
          <div style={{ maxHeight: 150, overflowY: "auto", marginTop: 4 }}>
            {result.unmatchedTransactions.map((t, i) => (
              <div key={i} className="unmatched-row dimmed">
                <span>{t.date}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.payee_name}
                </span>
                <span className="amount-negative">{formatAmount(t.amount)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="empty-state">
          <p>Navigate to your Amazon order history, pick a date range, and click "Sync & Match".</p>
          <p>Matches uncategorized YNAB Amazon transactions with your actual order items.</p>
        </div>
      )}
    </div>
  );
}
