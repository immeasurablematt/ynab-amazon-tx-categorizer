"use server";

import { getSession } from "@/lib/session";
import { db } from "@/db";
import { users, ynabConnections, subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getYnabToken } from "@/lib/ynab-token";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function fetchBudgets() {
  try {
    const session = await getSession();
    if (!session?.user?.id) return { error: "Not authenticated" };

    const token = await getYnabToken(session.user.id);
    const res = await fetch("https://api.ynab.com/v1/budgets", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { error: "Failed to fetch budgets from YNAB" };
    const data = await res.json();
    return { budgets: data.data.budgets.map((b: any) => ({ id: b.id, name: b.name })) };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function fetchAccounts(budgetId: string) {
  try {
    const session = await getSession();
    if (!session?.user?.id) return { error: "Not authenticated" };

    const token = await getYnabToken(session.user.id);
    const res = await fetch(`https://api.ynab.com/v1/budgets/${budgetId}/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { error: "Failed to fetch accounts from YNAB" };
    const data = await res.json();
    // Filter to active, on-budget accounts
    const active = data.data.accounts.filter((a: any) => !a.closed && !a.deleted && a.on_budget);
    return { accounts: active.map((a: any) => ({ id: a.id, name: a.name })) };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function completeSetup(input: {
  email: string;
  budgetId: string;
  budgetName: string;
  accountId: string;
  accountName: string;
  duplicateDaysTolerance: number;
}) {
  try {
    const session = await getSession();
    if (!session?.user?.id) return { error: "Not authenticated" };

    // 1. Save email
    await db.update(users).set({ email: input.email }).where(eq(users.id, session.user.id));

    // 2. Create Stripe customer
    const customer = await getStripe().customers.create({
      email: input.email,
      metadata: { userId: session.user.id },
    });

    // 3. Create YNAB connection
    await db.insert(ynabConnections).values({
      userId: session.user.id,
      budgetId: input.budgetId,
      budgetName: input.budgetName,
      accountId: input.accountId,
      accountName: input.accountName,
      duplicateDaysTolerance: input.duplicateDaysTolerance,
    }).onConflictDoUpdate({
      target: [ynabConnections.userId, ynabConnections.budgetId, ynabConnections.accountId],
      set: {
        budgetName: input.budgetName,
        accountName: input.accountName,
        duplicateDaysTolerance: input.duplicateDaysTolerance,
      },
    });

    // 4. Create subscription record (14-day trial, no Stripe subscription yet)
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);

    await db.insert(subscriptions).values({
      userId: session.user.id,
      stripeCustomerId: customer.id,
      status: "trialing",
      currentPeriodEnd: trialEnd,
    }).onConflictDoNothing();

    return { success: true };
  } catch (e: any) {
    return { error: e.message };
  }
}
