import { NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import User from '@/models/User';
import { checkRateLimit } from '@/lib/ratelimit';
import { getStripeRateLimit } from '@/config/ratelimits';
import { handleApiError } from '@/lib/errors';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
});

const changeBillingCycleSchema = z.object({
  billingCycle: z.enum(['monthly', 'annual']),
}).strict();

export async function POST(req) {
  const rateLimitResponse = checkRateLimit(req, getStripeRateLimit('changePlan'));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    await connectDB();
    const body = await req.json();
    const validated = changeBillingCycleSchema.parse(body);

    const userDoc = await User.findById(user.id);
    if (!userDoc) {
      return NextResponse.json(
        { success: false, message: 'user not found' },
        { status: 404 }
      );
    }

    const subscriptionId = userDoc.subscription?.stripeSubscriptionId;
    if (!subscriptionId) {
      return NextResponse.json(
        { success: false, message: 'no active subscription found' },
        { status: 404 }
      );
    }

    // get current subscription from stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const currentPriceId = subscription.items.data[0]?.price?.id;
    
    // determine current plan and billing cycle
    const isCurrentAnnual = currentPriceId === process.env.STRIPE_PRICE_PRO_ANNUAL || 
                           currentPriceId === process.env.STRIPE_PRICE_BUSINESS_ANNUAL;
    const currentPlan = (currentPriceId === process.env.STRIPE_PRICE_PRO || currentPriceId === process.env.STRIPE_PRICE_PRO_ANNUAL) ? 'pro' : 
                       (currentPriceId === process.env.STRIPE_PRICE_BUSINESS || currentPriceId === process.env.STRIPE_PRICE_BUSINESS_ANNUAL) ? 'business' : null;

    if (!currentPlan) {
      return NextResponse.json(
        { success: false, message: 'could not determine current plan' },
        { status: 400 }
      );
    }

    // check if billing cycle is actually changing
    const isChangingToAnnual = validated.billingCycle === 'annual';
    if (isCurrentAnnual === isChangingToAnnual) {
      return NextResponse.json(
        { success: false, message: `already on ${validated.billingCycle} billing` },
        { status: 400 }
      );
    }

    // determine target price id
    let targetPriceId;
    if (isChangingToAnnual) {
      targetPriceId = currentPlan === 'pro'
        ? process.env.STRIPE_PRICE_PRO_ANNUAL
        : process.env.STRIPE_PRICE_BUSINESS_ANNUAL;
    } else {
      targetPriceId = currentPlan === 'pro'
        ? process.env.STRIPE_PRICE_PRO
        : process.env.STRIPE_PRICE_BUSINESS;
    }

    if (!targetPriceId) {
      return NextResponse.json(
        { success: false, message: 'price configuration error' },
        { status: 500 }
      );
    }

    const customerId = typeof subscription.customer === 'string' 
      ? subscription.customer 
      : subscription.customer.id;

    // schedule billing cycle change at end of current period
    // handled in the webhook system and wont appear in Stripes billing portal
    // the portal will only show that the current subscription is canceling
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
      metadata: {
        ...(subscription.metadata || {}),
        changeBillingCycleTo: validated.billingCycle,
        targetPriceId: targetPriceId,
        userId: user.id,
        plan: currentPlan,
      },
    });

    // update user record to reflect scheduled change
    await User.findByIdAndUpdate(user.id, {
      $set: {
        'subscription.cancelAtPeriodEnd': true,
      },
    });

    return NextResponse.json({
      success: true,
      message: `billing cycle will switch to ${validated.billingCycle} at the end of your current billing period`,
      data: {
        billingCycle: validated.billingCycle,
        plan: currentPlan,
        scheduled: true,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: error.errors[0].message },
        { status: 400 }
      );
    }
    return handleApiError(error, 'change_billing_cycle');
  }
}

