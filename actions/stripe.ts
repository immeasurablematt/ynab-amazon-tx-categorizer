"use server";

import { getSession } from "@/lib/session";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function createCheckoutSession() {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, session.user.id),
  });
  if (!sub) throw new Error("No subscription record found");

  const origin =
    process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

  const checkout = await getStripe().checkout.sessions.create({
    ui_mode: "embedded",
    mode: "subscription",
    customer: sub.stripeCustomerId!,
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    return_url: `${origin}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}`,
  });

  return { clientSecret: checkout.client_secret };
}

export async function createPortalSession() {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, session.user.id),
  });
  if (!sub) throw new Error("No subscription record found");

  const origin =
    process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

  const portal = await getStripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId!,
    return_url: `${origin}/dashboard/billing`,
  });

  return { url: portal.url };
}
