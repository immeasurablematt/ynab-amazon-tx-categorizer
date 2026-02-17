import React, { useEffect, useState } from "react";
import { getSettings, saveSettings } from "@lib/storage";
import type { ExtensionSettings } from "@lib/types";

export function Options() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  if (!settings) return <div style={{ padding: 32, color: "#64748b" }}>Loading...</div>;

  const update = (patch: Partial<ExtensionSettings>) => {
    setSettings({ ...settings, ...patch });
    setSaved(false);
  };

  const handleSave = async () => {
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: 20, marginBottom: 24 }}>YNAB Amazon Importer — Settings</h1>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, color: "#94a3b8", marginBottom: 12 }}>YNAB Credentials</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 12, color: "#94a3b8" }}>
            Personal Access Token
            <input
              type="password"
              value={settings.ynabToken}
              onChange={(e) => update({ ynabToken: e.target.value })}
              placeholder="Enter your YNAB token"
              style={inputStyle}
            />
          </label>
          <label style={{ fontSize: 12, color: "#94a3b8" }}>
            Budget ID
            <input
              value={settings.budgetId}
              onChange={(e) => update({ budgetId: e.target.value })}
              placeholder="Budget ID (will be selectable after setup)"
              style={inputStyle}
            />
          </label>
          <label style={{ fontSize: 12, color: "#94a3b8" }}>
            Account ID
            <input
              value={settings.accountId}
              onChange={(e) => update({ accountId: e.target.value })}
              placeholder="Account ID (will be selectable after setup)"
              style={inputStyle}
            />
          </label>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, color: "#94a3b8", marginBottom: 12 }}>AI Categorization (Optional)</h2>
        <label style={{ fontSize: 12, color: "#94a3b8" }}>
          Anthropic API Key
          <input
            type="password"
            value={settings.anthropicKey}
            onChange={(e) => update({ anthropicKey: e.target.value })}
            placeholder="sk-ant-... (leave blank to use keyword rules only)"
            style={inputStyle}
          />
        </label>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, color: "#94a3b8", marginBottom: 12 }}>Preferences</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 12, color: "#94a3b8" }}>
            Default Payee
            <input
              value={settings.defaultPayee}
              onChange={(e) => update({ defaultPayee: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={{ fontSize: 12, color: "#94a3b8" }}>
            Amazon Domain
            <select
              value={settings.amazonDomain}
              onChange={(e) => update({ amazonDomain: e.target.value as "amazon.ca" | "amazon.com" })}
              style={inputStyle}
            >
              <option value="amazon.ca">amazon.ca</option>
              <option value="amazon.com">amazon.com</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: "#94a3b8" }}>
            Duplicate Detection Tolerance (days)
            <input
              type="number"
              min={0}
              max={30}
              value={settings.duplicateDaysTolerance}
              onChange={(e) => update({ duplicateDaysTolerance: parseInt(e.target.value) || 5 })}
              style={inputStyle}
            />
          </label>
        </div>
      </section>

      <button onClick={handleSave} style={btnStyle}>
        {saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #334155",
  background: "#1e293b",
  color: "#e2e8f0",
  fontSize: 13,
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  padding: "10px 24px",
  borderRadius: 6,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};
