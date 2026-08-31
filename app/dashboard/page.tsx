import { getSession } from "@/lib/session";
import { db } from "@/db";
import { ynabConnections, importHistory } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getSession();

  const connection = await db.query.ynabConnections.findFirst({
    where: eq(ynabConnections.userId, session!.user!.id!),
  });

  const recentImports = await db.query.importHistory.findMany({
    where: eq(importHistory.userId, session!.user!.id!),
    orderBy: desc(importHistory.createdAt),
    limit: 5,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Connected Account */}
      {connection ? (
        <div className="mt-6 rounded-lg bg-slate-800 p-6">
          <h2 className="text-sm font-medium text-slate-400">Connected YNAB Account</h2>
          <p className="mt-1 text-lg font-semibold">{connection.budgetName} → {connection.accountName}</p>
          <p className="mt-1 text-sm text-slate-400">Duplicate tolerance: {connection.duplicateDaysTolerance} days</p>
        </div>
      ) : (
        <div className="mt-6 rounded-lg bg-slate-800 p-6 text-center">
          <p className="text-slate-400">No YNAB account connected yet.</p>
          <Link href="/dashboard/setup" className="mt-3 inline-block text-sky-400 hover:underline">Complete setup</Link>
        </div>
      )}

      {/* Quick actions */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link href="/dashboard/import" className="rounded-lg bg-sky-600 p-6 text-center font-semibold hover:bg-sky-500">
          Import Transactions
        </Link>
        <Link href="/dashboard/history" className="rounded-lg bg-slate-800 p-6 text-center font-semibold hover:bg-slate-700">
          View History
        </Link>
      </div>

      {/* Recent imports */}
      {recentImports.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Recent Imports</h2>
          <div className="mt-3 space-y-2">
            {recentImports.map((imp) => (
              <div key={imp.id} className="flex items-center justify-between rounded-lg bg-slate-800 px-4 py-3 text-sm">
                <span>{imp.importedCount} imported, {imp.skippedCount} skipped</span>
                <span className="text-slate-400">{imp.createdAt ? new Date(imp.createdAt).toLocaleDateString() : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
