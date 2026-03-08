import { neon } from "@neondatabase/serverless";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function getYnabToken(userId: string): Promise<string> {
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.provider, "ynab")),
  });

  if (!account) {
    throw new Error("No YNAB account found. Please sign in again.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (account.expires_at && account.expires_at > now + 300) {
    return account.access_token!;
  }

  const sql = neon(process.env.DATABASE_URL!);
  const lockKey = hashCode(userId);

  await sql`SELECT pg_advisory_xact_lock(${lockKey})`;

  try {
    const freshAccount = await db.query.accounts.findFirst({
      where: and(eq(accounts.userId, userId), eq(accounts.provider, "ynab")),
    });

    if (freshAccount?.expires_at && freshAccount.expires_at > now + 300) {
      return freshAccount.access_token!;
    }

    const response = await fetch("https://app.ynab.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.YNAB_CLIENT_ID!,
        client_secret: process.env.YNAB_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: freshAccount!.refresh_token!,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("YNAB refresh token invalid. Please sign in again.");
      }
      throw new Error(`YNAB token refresh failed: ${response.status}`);
    }

    const tokens = await response.json();

    await db
      .update(accounts)
      .set({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
        token_version: (freshAccount!.token_version ?? 0) + 1,
      })
      .where(
        and(eq(accounts.userId, userId), eq(accounts.provider, "ynab"))
      );

    return tokens.access_token;
  }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}
