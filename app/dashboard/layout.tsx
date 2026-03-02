import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/auth/signin");

  // Allow setup and billing pages through without subscription check
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";
  const isSetupPage = pathname.startsWith("/dashboard/setup");
  const isBillingPage = pathname.startsWith("/dashboard/billing");

  // Check subscription status
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, session.user.id),
  });

  // No subscription record = hasn't completed setup (but don't redirect if already on setup or billing)
  if (!sub && !isSetupPage && !isBillingPage) redirect("/dashboard/setup");

  // Check if trial/subscription is active
  const now = new Date();
  const isActive = isSetupPage || (sub && (sub.status === "active" ||
    (sub.status === "trialing" && sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now)));

  // Calculate days until trial expires (for banner)
  const daysRemaining = sub?.status === "trialing" && sub.currentPeriodEnd
    ? Math.ceil((new Date(sub.currentPeriodEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Billing page always passes through the paywall so expired users can re-subscribe

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Nav */}
      <nav className="border-b border-slate-800 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/dashboard" className="text-lg font-semibold text-sky-400">Amazon&rarr;YNAB</Link>
          <div className="flex items-center gap-6">
            <Link href="/dashboard/import" className="text-sm text-slate-300 hover:text-white">Import</Link>
            <Link href="/dashboard/history" className="text-sm text-slate-300 hover:text-white">History</Link>
            <Link href="/dashboard/billing" className="text-sm text-slate-300 hover:text-white">Billing</Link>
            <form action={async () => { "use server"; const { cookies } = await import("next/headers"); const c = await cookies(); c.delete("authjs.session-token"); const { redirect } = await import("next/navigation"); redirect("/"); }}>
              <button type="submit" className="text-sm text-slate-400 hover:text-white">Sign Out</button>
            </form>
          </div>
        </div>
      </nav>

      {/* Trial expiring banner */}
      {daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0 && (
        <div className="bg-amber-600 px-4 py-2 text-center text-sm font-medium text-white">
          Your trial ends in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}.
          <Link href="/dashboard/billing" className="ml-2 underline">Add payment method</Link>
        </div>
      )}

      {/* Paywall if expired — billing page always passes through */}
      {!isActive && !isBillingPage ? (
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <h2 className="text-2xl font-bold">Your {sub?.status === "trialing" ? "trial has" : "subscription has"} expired</h2>
          <p className="mt-3 text-slate-400">Subscribe to continue importing your Amazon purchases into YNAB.</p>
          <Link href="/dashboard/billing" className="mt-6 inline-block rounded-lg bg-sky-500 px-6 py-3 font-semibold text-white hover:bg-sky-400">
            Start Subscription
          </Link>
        </div>
      ) : (
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      )}
    </div>
  );
}
