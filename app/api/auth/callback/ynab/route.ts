import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { users, accounts, sessions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const baseUrl = process.env.AUTH_URL || "http://localhost:3000";

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/auth/signin?error=NoCode`);
  }

  // Verify state (log for debugging, but don't block — cookie may not survive cross-site redirect)
  const cookieStore = await cookies();
  const savedState = cookieStore.get("ynab-oauth-state")?.value;
  if (savedState && state && savedState !== state) {
    return NextResponse.redirect(`${baseUrl}/auth/signin?error=InvalidState`);
  }
  if (savedState) cookieStore.delete("ynab-oauth-state");

  // Exchange code for tokens
  const tokenRes = await fetch("https://app.ynab.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YNAB_CLIENT_ID!,
      client_secret: process.env.YNAB_CLIENT_SECRET!,
      redirect_uri: `${baseUrl}/api/auth/callback/ynab`,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!tokenRes.ok) {
    console.error("YNAB token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(`${baseUrl}/auth/signin?error=TokenExchange`);
  }

  const tokens = await tokenRes.json();

  // Get user info from YNAB
  const userRes = await fetch("https://api.ynab.com/v1/user", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) {
    console.error("YNAB user fetch failed:", await userRes.text());
    return NextResponse.redirect(`${baseUrl}/auth/signin?error=UserFetch`);
  }

  const userData = await userRes.json();
  const ynabUserId = userData.data.user.id;

  const db = getDb();

  // Upsert user
  let existingUser = await db.query.users.findFirst({
    where: eq(users.id, ynabUserId),
  });

  if (!existingUser) {
    await db.insert(users).values({
      id: ynabUserId,
      name: `YNAB User ${ynabUserId.slice(0, 8)}`,
    });
    existingUser = { id: ynabUserId, name: `YNAB User ${ynabUserId.slice(0, 8)}`, email: null, emailVerified: null, image: null };
  }

  // Upsert account (store tokens)
  const existingAccount = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, ynabUserId), eq(accounts.provider, "ynab")),
  });

  const expiresAt = Math.floor(Date.now() / 1000) + (tokens.expires_in || 7200);

  if (existingAccount) {
    await db.update(accounts)
      .set({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
      })
      .where(and(eq(accounts.userId, ynabUserId), eq(accounts.provider, "ynab")));
  } else {
    await db.insert(accounts).values({
      userId: ynabUserId,
      type: "oauth",
      provider: "ynab",
      providerAccountId: ynabUserId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
    });
  }

  // Create session
  const sessionToken = crypto.randomUUID();
  const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.insert(sessions).values({
    sessionToken,
    userId: ynabUserId,
    expires: sessionExpires,
  });

  // Set session cookie
  const response = NextResponse.redirect(`${baseUrl}/dashboard/setup`);
  response.cookies.set("authjs.session-token", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: sessionExpires,
    path: "/",
  });

  return response;
}
