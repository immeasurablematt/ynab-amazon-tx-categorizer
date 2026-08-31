"use client";

import { useState, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { createCheckoutSession, createPortalSession } from "@/actions/stripe";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

export default function BillingPage() {
  const [showCheckout, setShowCheckout] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const fetchClientSecret = useCallback(async () => {
    const { clientSecret } = await createCheckoutSession();
    return clientSecret!;
  }, []);

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch {
      setPortalLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Billing</h1>

      {!showCheckout ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg bg-slate-800 p-6">
            <h2 className="text-lg font-semibold">Subscription</h2>
            <p className="mt-2 text-slate-400">
              $4.99/month — Unlimited imports with AI categorization
            </p>

            <div className="mt-6 flex gap-4">
              <button
                onClick={() => setShowCheckout(true)}
                className="rounded-lg bg-sky-500 px-6 py-2 font-semibold text-white hover:bg-sky-400"
              >
                Subscribe Now
              </button>
              <button
                onClick={handlePortal}
                disabled={portalLoading}
                className="rounded-lg bg-slate-700 px-6 py-2 font-semibold text-white hover:bg-slate-600 disabled:opacity-50"
              >
                {portalLoading ? "Loading..." : "Manage Subscription"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <button
            onClick={() => setShowCheckout(false)}
            className="mb-4 text-sm text-slate-400 hover:text-white"
          >
            &larr; Back
          </button>
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ fetchClientSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      )}
    </div>
  );
}
