import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - Amazon to YNAB",
  description: "Terms of service for the Amazon to YNAB import service.",
};

export default function TermsPage() {
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
        <h1 className="text-4xl font-extrabold mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-500 mb-12">
          Last updated: February 2026
        </p>

        <div className="space-y-10 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              1. Service Description
            </h2>
            <p>
              Amazon&rarr;YNAB (&ldquo;the Service&rdquo;) provides a web
              application that imports Amazon purchase history into YNAB (You
              Need A Budget) with AI-powered transaction categorization. The
              Service parses Amazon order CSV exports, categorizes transactions
              using artificial intelligence, and creates corresponding entries
              in your YNAB budget via the YNAB API.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              2. Account Responsibilities
            </h2>
            <p>
              You are responsible for maintaining the security of your account.
              You must have a valid YNAB account to use the Service. You agree
              to provide accurate information when creating your account and to
              keep your account information up to date. You are responsible for
              all activity that occurs under your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              3. Subscription and Billing
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Free trial:</strong> New accounts receive a 14-day free
                trial with full access to all features. No credit card is
                required to start the trial.
              </li>
              <li>
                <strong>Monthly billing:</strong> After the trial period, the
                Service costs $4.99 per month, billed monthly through Stripe.
              </li>
              <li>
                <strong>Cancellation:</strong> You may cancel your subscription
                at any time from your account settings. Cancellation takes
                effect at the end of the current billing period. No refunds are
                issued for partial months.
              </li>
              <li>
                <strong>Price changes:</strong> We may change pricing with 30
                days&rsquo; notice. Continued use after a price change
                constitutes acceptance.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              4. Acceptable Use
            </h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>
                Use the Service for any unlawful purpose or in violation of
                these terms.
              </li>
              <li>
                Attempt to gain unauthorized access to the Service or its
                related systems.
              </li>
              <li>
                Upload malicious files or data designed to disrupt the Service.
              </li>
              <li>
                Resell, redistribute, or provide access to the Service to third
                parties without our consent.
              </li>
              <li>
                Exceed reasonable usage limits that may impact Service
                availability for other users.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              5. Data Handling
            </h2>
            <p>
              Your use of the Service is also governed by our{" "}
              <Link href="/privacy" className="text-sky-400 underline">
                Privacy Policy
              </Link>
              . By using the Service, you consent to the collection and use of
              data as described therein. You retain ownership of your data. We
              process your Amazon CSV data solely to provide the import service
              and do not retain order details after import completion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              6. AI Categorization Disclaimer
            </h2>
            <p>
              Transaction categorization is performed by artificial intelligence
              and may not always be accurate. You should review categorized
              transactions before or after import to ensure accuracy. We are not
              responsible for incorrectly categorized transactions or any
              budgeting decisions made based on AI-generated categories.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              7. Limitation of Liability
            </h2>
            <p>
              The Service is provided &ldquo;as is&rdquo; without warranties of
              any kind. We are not responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>
                Errors, duplicates, or data issues in your YNAB account
                resulting from use of the Service.
              </li>
              <li>
                Downtime or unavailability of the YNAB API or any third-party
                service.
              </li>
              <li>
                Inaccurate AI categorization of transactions.
              </li>
              <li>
                Loss of data due to account deletion or service discontinuation.
              </li>
            </ul>
            <p className="mt-3">
              In no event shall our total liability exceed the amount you paid
              for the Service in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              8. Third-Party Services
            </h2>
            <p>
              The Service integrates with YNAB, Stripe, and Anthropic (Claude
              AI). Your use of these services is subject to their respective
              terms of service and privacy policies. We are not responsible for
              changes to or issues with third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              9. Termination
            </h2>
            <p>
              We may suspend or terminate your account if you violate these
              terms, engage in abusive behavior, or if required by law. You may
              terminate your account at any time by canceling your subscription
              and requesting account deletion. Upon termination, your data will
              be permanently deleted in accordance with our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              10. Changes to Terms
            </h2>
            <p>
              We may update these terms from time to time. Material changes will
              be communicated via email or through the Service. Continued use
              after changes take effect constitutes acceptance of the revised
              terms. If you do not agree with the changes, you should stop using
              the Service and cancel your subscription.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100 mb-3">
              Contact
            </h2>
            <p>
              For questions about these terms, contact us at{" "}
              <a
                href="mailto:support@amazontoynab.com"
                className="text-sky-400 underline"
              >
                support@amazontoynab.com
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
