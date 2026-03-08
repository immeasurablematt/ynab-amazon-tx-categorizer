import Link from "next/link";

function Nav() {
  return (
    <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
      <Link href="/" className="text-xl font-bold text-slate-100 no-underline">
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
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-800 mt-24 py-8 px-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
        <p>&copy; 2026 Amazon&rarr;YNAB</p>
        <div className="flex gap-6">
          <Link href="/privacy" className="hover:text-slate-300 no-underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-slate-300 no-underline">
            Terms
          </Link>
          <Link href="/pricing" className="hover:text-slate-300 no-underline">
            Pricing
          </Link>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <Nav />

      {/* Hero */}
      <section className="text-center px-6 pt-20 pb-24 max-w-4xl mx-auto">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-6">
          Stop Manually Entering Amazon Purchases in YNAB
        </h1>
        <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-10">
          Upload your Amazon order history, get AI-powered categorization, and
          import to YNAB in seconds. Not hours.
        </p>
        <Link
          href="/auth/signin"
          className="inline-block bg-sky-500 hover:bg-sky-400 text-white font-semibold text-lg px-8 py-4 rounded-xl no-underline transition-colors"
        >
          Start Your Free 14-Day Trial
        </Link>
        <p className="text-sm text-slate-500 mt-4">No credit card required</p>
      </section>

      {/* Problem */}
      <section className="px-6 py-20 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-4">
          Sound Familiar?
        </h2>
        <p className="text-slate-400 text-center mb-12 max-w-2xl mx-auto">
          Amazon purchases are the messiest part of any YNAB workflow.
        </p>
        <div className="grid sm:grid-cols-3 gap-6">
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h3 className="text-lg font-semibold mb-2">
              Manual Entry Tedium
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Copying each Amazon order into YNAB one by one. Dozens of
              transactions every month, each requiring manual data entry.
            </p>
          </div>
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h3 className="text-lg font-semibold mb-2">
              Cryptic Descriptions
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Amazon bank charges show up as &ldquo;AMZN Mktp US&rdquo; or
              &ldquo;Amazon.com&rdquo; with no detail about what you actually
              bought.
            </p>
          </div>
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h3 className="text-lg font-semibold mb-2">Wrong Categories</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Everything ends up in a generic &ldquo;Shopping&rdquo; category.
              Your budget data is useless when you can&rsquo;t tell groceries
              from electronics.
            </p>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section className="px-6 py-20 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-4">
          A Better Way
        </h2>
        <p className="text-slate-400 text-center mb-12 max-w-2xl mx-auto">
          Let AI do the tedious work so your budget stays accurate.
        </p>
        <div className="grid sm:grid-cols-3 gap-6">
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="text-sky-400 text-2xl font-bold mb-3">CSV</div>
            <h3 className="text-lg font-semibold mb-2">
              Automatic CSV Import
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Upload your Amazon order history CSV and we parse it instantly.
              No manual copying, no reformatting.
            </p>
          </div>
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="text-sky-400 text-2xl font-bold mb-3">AI</div>
            <h3 className="text-lg font-semibold mb-2">
              AI Categorization
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Claude reads your product descriptions and matches them to your
              actual YNAB categories. Groceries, electronics, kids
              supplies&mdash;automatically.
            </p>
          </div>
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="text-sky-400 text-2xl font-bold mb-3">Split</div>
            <h3 className="text-lg font-semibold mb-2">
              Split Transactions
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Multi-item Amazon orders become proper split transactions in
              YNAB, each item categorized correctly.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-20 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">
          How It Works
        </h2>
        <div className="grid sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-sky-500/20 text-sky-400 text-xl font-bold flex items-center justify-center mx-auto mb-4">
              1
            </div>
            <h3 className="font-semibold mb-2">Export from Amazon</h3>
            <p className="text-slate-400 text-sm">
              Download your order history as a CSV using the Amazon Order
              History Reporter extension.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-sky-500/20 text-sky-400 text-xl font-bold flex items-center justify-center mx-auto mb-4">
              2
            </div>
            <h3 className="font-semibold mb-2">Connect YNAB</h3>
            <p className="text-slate-400 text-sm">
              Sign in with your YNAB account via OAuth. We never see your
              password.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-sky-500/20 text-sky-400 text-xl font-bold flex items-center justify-center mx-auto mb-4">
              3
            </div>
            <h3 className="font-semibold mb-2">Import with AI</h3>
            <p className="text-slate-400 text-sm">
              Upload your CSV. AI categorizes every item and imports directly
              into your YNAB budget. Done.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-20 max-w-6xl mx-auto" id="pricing">
        <h2 className="text-3xl font-bold text-center mb-12">
          Simple Pricing
        </h2>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md mx-auto text-center">
          <p className="text-slate-400 text-sm uppercase tracking-wider mb-2">
            Everything included
          </p>
          <div className="mb-6">
            <span className="text-5xl font-extrabold">$4.99</span>
            <span className="text-slate-400 text-lg">/month</span>
          </div>
          <ul className="text-left text-slate-300 text-sm space-y-3 mb-8">
            <li className="flex items-start gap-2">
              <span className="text-sky-400 mt-0.5">&#10003;</span>
              Unlimited imports
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sky-400 mt-0.5">&#10003;</span>
              AI-powered categorization
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sky-400 mt-0.5">&#10003;</span>
              Split transaction support
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sky-400 mt-0.5">&#10003;</span>
              Duplicate detection
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sky-400 mt-0.5">&#10003;</span>
              14-day free trial
            </li>
          </ul>
          <Link
            href="/auth/signin"
            className="block bg-sky-500 hover:bg-sky-400 text-white font-semibold py-3 rounded-xl no-underline transition-colors"
          >
            Start Free Trial
          </Link>
          <p className="text-xs text-slate-500 mt-3">No credit card required</p>
        </div>
      </section>

      {/* Security */}
      <section className="px-6 py-20 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-4">
          Your Data Is Safe
        </h2>
        <p className="text-slate-400 text-center mb-12 max-w-2xl mx-auto">
          Security is not an afterthought. It&rsquo;s built into every layer.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 text-center">
            <h3 className="font-semibold mb-2">YNAB OAuth</h3>
            <p className="text-slate-400 text-sm">
              We use YNAB&rsquo;s official OAuth flow. Your YNAB password never
              touches our servers.
            </p>
          </div>
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 text-center">
            <h3 className="font-semibold mb-2">No Password Storage</h3>
            <p className="text-slate-400 text-sm">
              We don&rsquo;t store passwords for any service. Authentication
              uses secure tokens only.
            </p>
          </div>
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 text-center">
            <h3 className="font-semibold mb-2">Encrypted Data</h3>
            <p className="text-slate-400 text-sm">
              All data is encrypted in transit and at rest. YNAB tokens are
              stored with AES-256 encryption.
            </p>
          </div>
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 text-center">
            <h3 className="font-semibold mb-2">Minimal Retention</h3>
            <p className="text-slate-400 text-sm">
              We keep only what&rsquo;s needed to provide the service. Delete
              your account and your data goes with it.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-20 max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          <details className="bg-slate-800 border border-slate-700 rounded-xl p-5 group">
            <summary className="font-semibold cursor-pointer list-none flex items-center justify-between">
              What is this?
              <span className="text-slate-500 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
            </summary>
            <p className="text-slate-400 text-sm mt-3 leading-relaxed">
              Amazon&rarr;YNAB imports your Amazon purchase history directly
              into YNAB with AI-powered categorization. Instead of manually
              entering each Amazon order, you upload a CSV and we handle the
              rest&mdash;matching each product to your YNAB categories
              automatically.
            </p>
          </details>
          <details className="bg-slate-800 border border-slate-700 rounded-xl p-5 group">
            <summary className="font-semibold cursor-pointer list-none flex items-center justify-between">
              How does AI categorization work?
              <span className="text-slate-500 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
            </summary>
            <p className="text-slate-400 text-sm mt-3 leading-relaxed">
              We use Claude (by Anthropic) to read your Amazon product
              descriptions and match them to your existing YNAB budget
              categories. If you have &ldquo;Groceries,&rdquo;
              &ldquo;Electronics,&rdquo; and &ldquo;Kids Supplies&rdquo; in
              YNAB, the AI will sort your purchases into those categories
              automatically.
            </p>
          </details>
          <details className="bg-slate-800 border border-slate-700 rounded-xl p-5 group">
            <summary className="font-semibold cursor-pointer list-none flex items-center justify-between">
              Is my YNAB data safe?
              <span className="text-slate-500 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
            </summary>
            <p className="text-slate-400 text-sm mt-3 leading-relaxed">
              Yes. We use YNAB&rsquo;s official OAuth integration&mdash;your
              password is never shared with us. We only access the budget and
              account data you authorize, and tokens are encrypted at rest. You
              can revoke access from your YNAB settings at any time.
            </p>
          </details>
          <details className="bg-slate-800 border border-slate-700 rounded-xl p-5 group">
            <summary className="font-semibold cursor-pointer list-none flex items-center justify-between">
              What Amazon data do you need?
              <span className="text-slate-500 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
            </summary>
            <p className="text-slate-400 text-sm mt-3 leading-relaxed">
              Just the order history CSV export from Amazon. We read the product
              names, dates, and amounts to create YNAB transactions. We
              don&rsquo;t need your Amazon login or any other Amazon account
              access.
            </p>
          </details>
          <details className="bg-slate-800 border border-slate-700 rounded-xl p-5 group">
            <summary className="font-semibold cursor-pointer list-none flex items-center justify-between">
              Can I cancel anytime?
              <span className="text-slate-500 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
            </summary>
            <p className="text-slate-400 text-sm mt-3 leading-relaxed">
              Yes. There are no contracts or commitments. Cancel from your
              account settings and you won&rsquo;t be charged again. Your data
              is deleted upon account closure.
            </p>
          </details>
          <details className="bg-slate-800 border border-slate-700 rounded-xl p-5 group">
            <summary className="font-semibold cursor-pointer list-none flex items-center justify-between">
              What about the Chrome extension?
              <span className="text-slate-500 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
            </summary>
            <p className="text-slate-400 text-sm mt-3 leading-relaxed">
              The Chrome extension (Amazon Order History Reporter) is a
              separate, free tool that exports your Amazon order history as a
              CSV file. You use it to get the data out of Amazon, then upload
              that CSV here for AI categorization and YNAB import.
            </p>
          </details>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-24 text-center max-w-4xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4">
          Ready to Save Hours Every Month?
        </h2>
        <p className="text-slate-400 text-lg mb-8">
          Stop copying Amazon orders by hand. Let AI handle the categories.
        </p>
        <Link
          href="/auth/signin"
          className="inline-block bg-sky-500 hover:bg-sky-400 text-white font-semibold text-lg px-8 py-4 rounded-xl no-underline transition-colors"
        >
          Start Your Free 14-Day Trial
        </Link>
        <p className="text-sm text-slate-500 mt-4">No credit card required</p>
      </section>

      <Footer />
    </div>
  );
}
