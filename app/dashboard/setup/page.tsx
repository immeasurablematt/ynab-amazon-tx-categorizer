"use client";
import { useState, useEffect } from "react";
import { completeSetup, fetchBudgets, fetchAccounts } from "./actions";

type Budget = { id: string; name: string };
type Account = { id: string; name: string };

export default function SetupPage() {
  const [email, setEmail] = useState("");
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [duplicateDays, setDuplicateDays] = useState(5);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchBudgets().then((result) => {
      if (result.error) { setError(result.error); setLoading(false); return; }
      setBudgets(result.budgets ?? []);
      setLoading(false);
    });
  }, []);

  async function handleBudgetChange(budgetId: string) {
    const budget = budgets.find(b => b.id === budgetId);
    setSelectedBudget(budget ?? null);
    setSelectedAccount(null);
    if (!budget) return;
    const result = await fetchAccounts(budget.id);
    if (result.error) { setError(result.error); return; }
    setAccounts(result.accounts ?? []);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !selectedBudget || !selectedAccount) return;
    setSubmitting(true);
    setError("");
    const result = await completeSetup({
      email,
      budgetId: selectedBudget.id,
      budgetName: selectedBudget.name,
      accountId: selectedAccount.id,
      accountName: selectedAccount.name,
      duplicateDaysTolerance: duplicateDays,
    });
    if (result.error) { setError(result.error); setSubmitting(false); return; }
    window.location.href = "/dashboard";
  }

  if (loading) return <div className="py-20 text-center text-slate-400">Loading your YNAB budgets...</div>;

  return (
    <div className="mx-auto max-w-lg py-12">
      <h1 className="text-2xl font-bold">Complete Your Setup</h1>
      <p className="mt-2 text-slate-400">Connect your YNAB budget and we{"'"}ll start your 14-day free trial.</p>

      {error && <div className="mt-4 rounded bg-red-900/50 px-4 py-2 text-red-300">{error}</div>}

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300">Email Address</label>
          <p className="text-xs text-slate-500">For billing receipts and account recovery</p>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300">YNAB Budget</label>
          <select required value={selectedBudget?.id ?? ""} onChange={e => handleBudgetChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white">
            <option value="">Select a budget...</option>
            {budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {selectedBudget && (
          <div>
            <label className="block text-sm font-medium text-slate-300">YNAB Account</label>
            <select required value={selectedAccount?.id ?? ""} onChange={e => setSelectedAccount(accounts.find(a => a.id === e.target.value) ?? null)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white">
              <option value="">Select an account...</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-300">Duplicate Detection Tolerance (days)</label>
          <p className="text-xs text-slate-500">Transactions within this many days with matching amounts are considered duplicates</p>
          <input type="number" min={0} max={30} value={duplicateDays} onChange={e => setDuplicateDays(parseInt(e.target.value) || 5)}
            className="mt-1 w-24 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
        </div>

        <button type="submit" disabled={submitting || !email || !selectedBudget || !selectedAccount}
          className="w-full rounded-lg bg-sky-500 py-3 font-semibold text-white hover:bg-sky-400 disabled:opacity-50">
          {submitting ? "Setting up..." : "Start 14-Day Free Trial"}
        </button>
      </form>
    </div>
  );
}
