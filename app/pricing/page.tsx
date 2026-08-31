import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing - Amazon to YNAB",
  description:
    "Simple pricing for AI-powered Amazon to YNAB imports. $4.99/month with a 14-day free trial.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <Link
          href="/"
          className="text-xl font-bold text-slate-100 no-underline"
        >
          Amazon&rarr;YNAB
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/auth/signin"
            className="text-sm text-slate-300 hover:text-slate-100 no-underline"
          >
            Log In
          </Link>
          <Link
            href="/auth/signin"
            className="text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-white px-4 py-2 rounded-lg no-underline transition-colors"
          >
            Start Free Trial
          </Link>
        </div>
      </nav>

      {/* Pricing */}
      <section className="px-6 pt-20 pb-32 max-w-6xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-center mb-4">
          Simple, Transparent Pricing
        </h1>
        <p className="text-slate-400 text-lg text-center mb-16 max-w-xl mx-auto">
          One plan. Everything included. Start with a free trial.
        </p>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-10 max-w-lg mx-auto text-center">
          <p className="text-slate-400 text-sm uppercase tracking-wider mb-2">
            Full Access
          </p>
          <div className="mb-2">
            <span className="text-6xl font-extrabold">$4.99</span>
            <span className="text-slate-400 text-xl">/month</span>
          </div>
          <p className="text-slate-500 text-sm mb-8">
            14-day free trial &middot; No credit card required
          </p>

          <ul className="text-left text-slate-300 space-y-4 mb-10">
            <li className="flex items-start gap-3">
              <span className="text-sky-400 mt-0.5 shrink-0">&#10003;</span>
              <span>
                <strong className="text-slate-100">Unlimited imports</strong>
                <br />
                <span className="text-sm text-slate-400">
                  Import as many Amazon orders as you need, every month.
                </span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-sky-400 mt-0.5 shrink-0">&#10003;</span>
              <span>
                <strong className="text-slate-100">
                  AI-powered categorization
                </strong>
                <br />
                <span className="text-sm text-slate-400">
                  Claude matches each product to your YNAB categories
                  automatically.
                </span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-sky-400 mt-0.5 shrink-0">&#10003;</span>
              <span>
                <strong className="text-slate-100">
                  Split transaction support
                </strong>
                <br />
                <span className="text-sm text-slate-400">
                  Multi-item orders become properly split YNAB transactions.
                </span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-sky-400 mt-0.5 shrink-0">&#10003;</span>
              <span>
                <strong className="text-slate-100">Duplicate detection</strong>
                <br />
                <span className="text-sm text-slate-400">
                  Already imported that order? We skip it automatically.
                </span>
              </span>
            </li>
          </ul>

          <Link
            href="/auth/signin"
            className="block bg-sky-500 hover:bg-sky-400 text-white font-semibold text-lg py-4 rounded-xl no-underline transition-colors"
          >
            Start Free Trial
          </Link>
          <p className="text-xs text-slate-500 mt-4">
            Cancel anytime. No contracts.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 px-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <p>&copy; 2026 Amazon&rarr;YNAB</p>
          <div className="flex gap-6">
            <Link
              href="/privacy"
              className="hover:text-slate-300 no-underline"
            >
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-300 no-underline">
              Terms
            </Link>
            <Link
              href="/pricing"
              className="hover:text-slate-300 no-underline"
            >
              Pricing
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
