"use client";
import { useState } from "react";

export default function ImportPage() {
  const [mode, setMode] = useState<"convert" | "import">("import");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleConvert() {
    if (!file) return;
    setLoading(true);
    setStatus("Converting...");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/normalize", { method: "POST", body: form });
      if (!res.ok) throw new Error("Conversion failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "amazon_ynab_ready.csv";
      a.click();
      URL.revokeObjectURL(url);
      setStatus("CSV downloaded successfully!");
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setStatus("Importing...");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setStatus(`Imported ${data.imported} transactions. Skipped ${data.skippedDuplicates} duplicates.`);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Import Transactions</h1>

      {/* Mode selection */}
      <div className="mt-6 flex gap-3">
        <button onClick={() => setMode("convert")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${mode === "convert" ? "bg-sky-500 text-white" : "bg-slate-800 text-slate-300"}`}>
          Convert CSV
        </button>
        <button onClick={() => setMode("import")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${mode === "import" ? "bg-sky-500 text-white" : "bg-slate-800 text-slate-300"}`}>
          Import to YNAB
        </button>
      </div>

      {/* File upload */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-slate-300">
          {mode === "convert" ? "Upload Amazon Order CSV" : "Upload YNAB-Ready CSV"}
        </label>
        <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="mt-2 block w-full text-sm text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-600" />
      </div>

      {/* Action button */}
      <button onClick={mode === "convert" ? handleConvert : handleImport}
        disabled={!file || loading}
        className="mt-6 rounded-lg bg-sky-500 px-6 py-3 font-semibold text-white hover:bg-sky-400 disabled:opacity-50">
        {loading ? "Processing..." : mode === "convert" ? "Convert & Download" : "Import to YNAB"}
      </button>

      {/* Status */}
      {status && (
        <div className={`mt-6 rounded-lg p-4 text-sm ${status.startsWith("Error") ? "bg-red-900/50 text-red-300" : "bg-green-900/50 text-green-300"}`}>
          {status}
        </div>
      )}
    </div>
  );
}
