import React, { useRef, useState } from "react";
import type { CsvRow } from "@lib/types";

interface Props {
  orders: CsvRow[];
  setOrders: (orders: CsvRow[]) => void;
}

export function ReviewView({ orders, setOrders }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

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
    }
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
        setStatus({
          type: "success",
          text: `Imported ${r.imported} | ${r.skippedDuplicates} dupes skipped`,
        });
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Actions row */}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" onClick={handleScrape} disabled={loading}>
          {loading ? <span className="spinner" /> : "Scrape Page"}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          Upload CSV
        </button>
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
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: "nowrap" }}>{o.Date}</td>
                    <td style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.Memo}>
                      {o.Memo}
                    </td>
                    <td className={o.Amount < 0 ? "amount-negative" : "amount-positive"}>
                      {formatAmount(o.Amount)}
                    </td>
                    <td className={o.Category === "Uncategorized" ? "category-uncategorized" : ""}>
                      {o.Category || "Uncategorized"}
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
            {loading ? <span className="spinner" /> : `Import ${orders.length} to YNAB`}
          </button>
        </>
      )}
    </div>
  );
}
