import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Amazon to YNAB",
  description: "Privacy policy for the Amazon to YNAB import service.",
};

export default function PrivacyPage() {
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
        <Link
          href="/auth/signin"
          className="text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-white px-4 py-2 rounded-lg no-underline transition-colors"
        >
          Start Free Trial
        </Link>
      </nav>

      {/* Content */}
      <article className="px-6 pt-16 pb-24 max-w-3xl mx-auto">
        <h1 className="text-4xl font-extrabold mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-12">
          Last updated: February 2026
        </p>

        <div className="space-y-10 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              Overview
            </h2>
            <p>
              Amazon&rarr;YNAB (&ldquo;we,&rdquo; &ldquo;our,&rdquo;
              &ldquo;the Service&rdquo;) helps you import Amazon purchase
              history into YNAB (You Need A Budget) with AI-powered
              categorization. This policy explains what data we collect, how we
              use it, and your rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              What We Collect
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>YNAB account information:</strong> Your YNAB user ID,
                email address, and the budget and account IDs you choose to
                connect via OAuth.
              </li>
              <li>
                <strong>Import metadata:</strong> Timestamps, transaction
                counts, and import IDs for each import you perform. This lets us
                detect duplicates and show your import history.
              </li>
              <li>
                <strong>Subscription data:</strong> Your Stripe customer ID and
                subscription status for billing purposes.
              </li>
              <li>
                <strong>Amazon CSV data:</strong> The contents of the Amazon
                order CSV files you upload, processed in memory for
                categorization and import. We do not permanently store your
                Amazon order data after the import is complete.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              What We Do Not Collect
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Your YNAB password.</strong> We use YNAB&rsquo;s
                official OAuth flow. Your credentials are entered directly on
                YNAB&rsquo;s site, never on ours.
              </li>
              <li>
                <strong>Your full YNAB transaction history.</strong> We only
                access the specific budget and account you authorize for import.
              </li>
              <li>
                <strong>Amazon account credentials.</strong> We never ask for or
                access your Amazon login. You export the CSV yourself.
              </li>
              <li>
                <strong>Permanent Amazon order details.</strong> CSV data is
                processed in memory and discarded after import. We retain only
                minimal metadata (dates, counts) for duplicate detection.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              How We Use Your Data
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Providing the service:</strong> Parsing your CSV,
                categorizing transactions with AI, and importing them into YNAB.
              </li>
              <li>
                <strong>Duplicate detection:</strong> Checking import metadata
                to prevent the same transactions from being imported twice.
              </li>
              <li>
                <strong>Improving categorization:</strong> Aggregate,
                anonymized patterns may be used to improve AI categorization
                accuracy. Individual order data is never used for this purpose.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              Third-Party Services
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>YNAB (You Need A Budget):</strong> OAuth authentication
                and transaction import via the YNAB API. Subject to{" "}
                <a
                  href="https://www.ynab.com/privacy-policy"
                  className="text-sky-400 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  YNAB&rsquo;s Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong>Stripe:</strong> Payment processing for subscriptions.
                We do not store your payment card details. Subject to{" "}
                <a
                  href="https://stripe.com/privacy"
                  className="text-sky-400 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Stripe&rsquo;s Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong>Anthropic (Claude AI):</strong> Product descriptions
                from your CSV are sent to Claude for categorization. Anthropic
                does not use API inputs for training. Subject to{" "}
                <a
                  href="https://www.anthropic.com/privacy"
                  className="text-sky-400 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Anthropic&rsquo;s Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong>Vercel:</strong> Application hosting and analytics.
                Subject to{" "}
                <a
                  href="https://vercel.com/legal/privacy-policy"
                  className="text-sky-400 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Vercel&rsquo;s Privacy Policy
                </a>
                .
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              YNAB OAuth Access
            </h2>
            <p>
              When you connect your YNAB account, you authorize us to access
              specific data through YNAB&rsquo;s OAuth system. We only request
              the permissions needed to read your budget categories and create
              transactions. You can revoke this access at any time from your
              YNAB account settings under &ldquo;Authorized Applications.&rdquo;
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              Data Retention and Deletion
            </h2>
            <p>
              We retain your account data and import metadata for as long as
              your account is active. When you delete your account, we
              permanently delete all associated data, including your YNAB tokens,
              import history, and Stripe subscription data. This deletion is
              irreversible.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              Data Security
            </h2>
            <p>
              YNAB access tokens are encrypted at rest using AES-256 encryption.
              All data is transmitted over HTTPS. We follow security best
              practices for authentication, session management, and data storage.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              Contact
            </h2>
            <p>
              For privacy questions or data deletion requests, contact us at{" "}
              <a
                href="mailto:privacy@amazontoynab.com"
                className="text-sky-400 underline"
              >
                privacy@amazontoynab.com
              </a>
              .
            </p>
          </section>
        </div>
      </article>

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
