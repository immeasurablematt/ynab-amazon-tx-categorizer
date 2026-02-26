import React, { useEffect, useState } from "react";
import { isConfigured, getPendingOrders } from "@lib/storage";
import { SetupView } from "./SetupView";
import { ReviewView } from "./ReviewView";
import { MatchView } from "./MatchView";
import type { CsvRow } from "@lib/types";

type View = "loading" | "setup" | "ready";
type Tab = "match" | "csv";

export function Popup() {
  const [view, setView] = useState<View>("loading");
  const [tab, setTab] = useState<Tab>("match");
  const [orders, setOrders] = useState<CsvRow[]>([]);

  useEffect(() => {
    (async () => {
      const configured = await isConfigured();
      if (!configured) {
        setView("setup");
        return;
      }
      const pending = await getPendingOrders();
      setOrders(pending);
      setView("ready");
    })();
  }, []);

  const handleSetupComplete = () => {
    setView("ready");
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  if (view === "loading") {
    return (
      <div className="popup-container">
        <div className="empty-state">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <div className="popup-header">
        <h1>YNAB Amazon Importer</h1>
        <a className="settings-link" onClick={openOptions}>
          Settings
        </a>
      </div>

      {view === "setup" && <SetupView onComplete={handleSetupComplete} />}
      {view === "ready" && (
        <>
          <div className="tab-bar">
            <button
              className={`tab-btn ${tab === "match" ? "active" : ""}`}
              onClick={() => setTab("match")}
            >
              Match & Categorize
            </button>
            <button
              className={`tab-btn ${tab === "csv" ? "active" : ""}`}
              onClick={() => setTab("csv")}
            >
              CSV Import
            </button>
          </div>

          {tab === "match" && <MatchView />}
          {tab === "csv" && <ReviewView orders={orders} setOrders={setOrders} />}
        </>
      )}
    </div>
  );
}
