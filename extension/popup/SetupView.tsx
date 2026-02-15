import React, { useState } from "react";
import { saveSettings } from "@lib/storage";

interface Props {
  onComplete: () => void;
}

export function SetupView({ onComplete }: Props) {
  const [token, setToken] = useState("");
  const [budgets, setBudgets] = useState<{ id: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [budgetId, setBudgetId] = useState("");
  const [budgetName, setBudgetName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [step, setStep] = useState<"token" | "budget" | "account">("token");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validateToken = async () => {
    setLoading(true);
    setError("");
    try {
      const response: { budgets?: { id: string; name: string }[]; error?: string } =
        await chrome.runtime.sendMessage({
          type: "FETCH_BUDGETS",
          payload: { token },
        });
      if (response.error) {
        setError(response.error);
        return;
      }
      setBudgets(response.budgets ?? []);
      setStep("budget");
    } catch (e) {
      setError("Failed to connect. Check your token.");
    } finally {
      setLoading(false);
    }
  };

  const selectBudget = async (id: string) => {
    const selected = budgets.find((b) => b.id === id);
    setBudgetId(id);
    setBudgetName(selected?.name ?? "");
    setLoading(true);
    setError("");
    try {
      const response: { accounts?: { id: string; name: string }[]; error?: string } =
        await chrome.runtime.sendMessage({
          type: "FETCH_ACCOUNTS",
          payload: { token, budgetId: id },
        });
      if (response.error) {
        setError(response.error);
        return;
      }
      setAccounts(response.accounts ?? []);
      setStep("account");
    } catch (e) {
      setError("Failed to fetch accounts.");
    } finally {
      setLoading(false);
    }
  };

  const selectAccount = async (id: string) => {
    const selected = accounts.find((a) => a.id === id);
    setAccountId(id);
    setAccountName(selected?.name ?? "");
    await saveSettings({
      ynabToken: token,
      budgetId,
      budgetName,
      accountId: id,
      accountName: selected?.name ?? "",
    });
    onComplete();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 12, color: "#94a3b8" }}>
        Connect your YNAB account to get started.
      </p>

      {error && (
        <div className="status-badge error" style={{ alignSelf: "flex-start" }}>
          {error}
        </div>
      )}

      {step === "token" && (
        <div className="form-group">
          <label>YNAB Personal Access Token</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your token from YNAB Settings → Developer"
          />
          <button
            className="btn btn-primary btn-full"
            onClick={validateToken}
            disabled={!token.trim() || loading}
            style={{ marginTop: 8 }}
          >
            {loading ? <span className="spinner" /> : "Connect"}
          </button>
        </div>
      )}

      {step === "budget" && (
        <div className="form-group">
          <label>Select Budget</label>
          {budgets.map((b) => (
            <button
              key={b.id}
              className="btn btn-secondary btn-full"
              onClick={() => selectBudget(b.id)}
              disabled={loading}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {step === "account" && (
        <div className="form-group">
          <label>Select Account ({budgetName})</label>
          {accounts.map((a) => (
            <button
              key={a.id}
              className="btn btn-secondary btn-full"
              onClick={() => selectAccount(a.id)}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
