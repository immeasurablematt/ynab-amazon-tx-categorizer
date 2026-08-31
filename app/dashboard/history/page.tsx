import { getSession } from "@/lib/session";
import { db } from "@/db";
import { importHistory } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export default async function HistoryPage() {
  const session = await getSession();
  const history = await db.query.importHistory.findMany({
    where: eq(importHistory.userId, session!.user!.id!),
    orderBy: desc(importHistory.createdAt),
    limit: 50,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Import History</h1>

      {history.length === 0 ? (
        <p className="mt-6 text-slate-400">No imports yet. Go to Import to get started.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Imported</th>
                <th className="px-4 py-3">Skipped</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {history.map((row) => (
                <tr key={row.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "\u2014"}</td>
                  <td className="px-4 py-3">{row.importedCount}</td>
                  <td className="px-4 py-3">{row.skippedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
