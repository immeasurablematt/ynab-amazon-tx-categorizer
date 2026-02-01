"use client";

import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"convert" | "import">("convert");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported?: number; skippedDuplicates?: number; error?: string } | null>(null);
  const [showSteps, setShowSteps] = useState(true);

  async function handleConvert() {
    if (!file) {
      setStatus("Please select a file.");
      return;
    }
    setLoading(true);
    setStatus(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/normalize", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "amazon_ynab_ready.csv";
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Converted! Download started. Review the CSV, fix any categories, then switch to Import and upload it.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Convert failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file) {
      setStatus("Please select a file.");
      return;
    }
    setLoading(true);
    setStatus(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Error ${res.status}`);
      }
      setResult(data);
      setStatus(
        `Imported ${data.imported ?? 0} transaction(s). ` +
        (data.skippedDuplicates ? `Skipped ${data.skippedDuplicates} duplicate(s). ` : "") +
        "Done."
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
        YNAB Import
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>
        Convert Amazon order exports and import to YNAB with categories. Duplicates are skipped.
      </p>

      {/* Explicit steps - always visible so you remember in a month */}
      <section
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 12,
          padding: "1.25rem 1.5rem",
          marginBottom: "2rem",
        }}
      >
        <button
          onClick={() => setShowSteps(!showSteps)}
          style={{
            background: "none",
            border: "none",
            color: "#e2e8f0",
            fontSize: "1rem",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            width: "100%",
            textAlign: "left",
          }}
        >
          {showSteps ? "▼" : "▶"} Step-by-step (do this every time)
        </button>
        {showSteps && (
          <ol
            style={{
              margin: "1rem 0 0",
              paddingLeft: "1.25rem",
              color: "#cbd5e1",
              lineHeight: 1.7,
              fontSize: "0.95rem",
            }}
          >
            <li>
              <strong>Export from Amazon</strong> — Install{" "}
              <a href="https://chromewebstore.google.com/detail/amazon-order-history-repo/mgkilgclilajckgnedgjgnfdokkgnibi" target="_blank" rel="noreferrer">
                Amazon Order History Reporter
              </a>
              . Go to Amazon → Your Orders → click the orange <strong>A</strong> → pick a year → download CSV.
            </li>
            <li>
              <strong>Convert</strong> — Choose &quot;Convert Amazon export&quot; below, select your CSV, click Convert &amp; Download. You get <code style={{ background: "#0f172a", padding: "2px 4px", borderRadius: 4 }}>amazon_ynab_ready.csv</code>.
            </li>
            <li>
              <strong>Review</strong> — Open the CSV. Check the Category column. Fix any wrong categories (e.g. change &quot;Uncategorized&quot; to &quot;Kids Supplies&quot;).
            </li>
            <li>
              <strong>Import</strong> — Switch to &quot;Import to YNAB&quot; below, select the same CSV, click Import to YNAB. Duplicates are skipped.
            </li>
          </ol>
        )}
      </section>

      {/* Setup (one-time) */}
      <details
        style={{
          marginBottom: "2rem",
          fontSize: "0.875rem",
          color: "#94a3b8",
        }}
      >
        <summary style={{ cursor: "pointer", marginBottom: "0.5rem" }}>
          One-time setup: Vercel Environment Variables
        </summary>
        <p style={{ margin: "0.5rem 0" }}>
          In Vercel → Project → Settings → Environment Variables, add:
        </p>
        <ul style={{ margin: "0.25rem 0", paddingLeft: "1.25rem" }}>
          <li><code>YNAB_ACCESS_TOKEN</code> — YNAB → Settings → Developer → Personal Access Token</li>
          <li><code>YNAB_BUDGET_ID</code> — Run <code>python get_ynab_ids.py</code> locally to get it</li>
          <li><code>YNAB_ACCOUNT_ID</code> — Same script; use the account you want (e.g. [MBNA] Amazon.ca Rewards)</li>
        </ul>
        <p style={{ margin: "0.5rem 0 0" }}>
          Redeploy after adding. For AI categorization, use the Python script locally.
        </p>
      </details>

      {/* Mode selection */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
          Step 1: Choose mode
        </label>
        <div style={{ display: "flex", gap: "1rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input
              type="radio"
              name="mode"
              checked={mode === "convert"}
              onChange={() => setMode("convert")}
            />
            Convert Amazon export
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input
              type="radio"
              name="mode"
              checked={mode === "import"}
              onChange={() => setMode("import")}
            />
            Import to YNAB
          </label>
        </div>
      </div>

      {/* File input */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
          Step 2: Select CSV
        </label>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
          }}
          style={{
            display: "block",
            padding: "0.5rem",
            border: "1px solid #334155",
            borderRadius: 8,
            background: "#1e293b",
            color: "#e2e8f0",
          }}
        />
      </div>

      {/* Action button */}
      <div style={{ marginBottom: "1.5rem" }}>
        <button
          onClick={mode === "convert" ? handleConvert : handleImport}
          disabled={loading}
          style={{
            padding: "0.75rem 1.5rem",
            background: loading ? "#475569" : "#0ea5e9",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "..." : mode === "convert" ? "Convert & Download" : "Import to YNAB"}
        </button>
      </div>

      {/* Status / result */}
      {(status || result) && (
        <div
          style={{
            padding: "1rem",
            background: result?.error ? "#7f1d1d" : "#0f172a",
            border: "1px solid #334155",
            borderRadius: 8,
          }}
        >
          {status && <p style={{ margin: 0 }}>{status}</p>}
          {result && !result.error && (
            <pre style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "#94a3b8" }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}

      <p style={{ marginTop: "2rem", fontSize: "0.875rem", color: "#64748b" }}>
        <a href="https://github.com/immeasurablematt/ynab-automation" target="_blank" rel="noreferrer">
          Source
        </a>
        {" · "}
        <a href="https://chromewebstore.google.com/detail/amazon-order-history-repo/mgkilgclilajckgnedgjgnfdokkgnibi" target="_blank" rel="noreferrer">
          Amazon Order History Reporter
        </a>
      </p>
    </main>
  );
}
