import React, { useEffect, useState } from "react";
import { isConfigured, getPendingOrders } from "@lib/storage";
import { SetupView } from "./SetupView";
import { ReviewView } from "./ReviewView";
import type { CsvRow } from "@lib/types";

type View = "loading" | "setup" | "review";

export function Popup() {
  const [view, setView] = useState<View>("loading");
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
      setView("review");
    })();
  }, []);

  const handleSetupComplete = () => {
    setView("review");
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
      {view === "review" && <ReviewView orders={orders} setOrders={setOrders} />}
    </div>
  );
}
