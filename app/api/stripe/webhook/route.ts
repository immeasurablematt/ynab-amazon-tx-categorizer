import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription && session.customer) {
        await db
          .update(subscriptions)
          .set({
            stripeSubscriptionId: session.subscription as string,
            status: "active",
          })
          .where(
            eq(subscriptions.stripeCustomerId, session.customer as string)
          );
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await db
        .update(subscriptions)
        .set({
          status:
            subscription.status === "active"
              ? "active"
              : subscription.status === "past_due"
                ? "past_due"
                : subscription.status === "canceled"
                  ? "canceled"
                  : "canceled" as const,
          currentPeriodEnd: new Date(
            (subscription as unknown as { current_period_end: number }).current_period_end * 1000
          ),
        })
        .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await db
        .update(subscriptions)
        .set({ status: "canceled" })
        .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.customer) {
        await db
          .update(subscriptions)
          .set({ status: "past_due" })
          .where(
            eq(subscriptions.stripeCustomerId, invoice.customer as string)
          );
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
