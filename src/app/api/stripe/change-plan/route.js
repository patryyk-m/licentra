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

const changePlanSchema = z.object({
  targetPlan: z.enum(['pro', 'business']),
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
    const validated = changePlanSchema.parse(body);

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
    
    // determine target price id (preserve billing cycle)
    let targetPriceId;
    if (isCurrentAnnual) {
      targetPriceId = validated.targetPlan === 'pro'
        ? process.env.STRIPE_PRICE_PRO_ANNUAL
        : process.env.STRIPE_PRICE_BUSINESS_ANNUAL;
    } else {
      targetPriceId = validated.targetPlan === 'pro'
        ? process.env.STRIPE_PRICE_PRO
        : process.env.STRIPE_PRICE_BUSINESS;
    }

    if (!targetPriceId) {
      return NextResponse.json(
        { success: false, message: 'price configuration error' },
        { status: 500 }
      );
    }

    // check if its an upgrade or downgrade
    const isUpgrade = (currentPlan === 'pro' && validated.targetPlan === 'business');
    const isDowngrade = (currentPlan === 'business' && validated.targetPlan === 'pro');

    if (isUpgrade) {
      // upgrade: cancel current subscription immediately, create new one
      const customerId = typeof subscription.customer === 'string' 
        ? subscription.customer 
        : subscription.customer.id;

      // cancel current subscription
      await stripe.subscriptions.cancel(subscriptionId);

      // create new subscription with target plan (preserve billing cycle, no trial)
      const newSubscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: targetPriceId }],
        metadata: {
          userId: user.id,
          plan: validated.targetPlan,
        },
      });

      // update user record
      await User.findByIdAndUpdate(user.id, {
        $set: {
          'subscription.stripeSubscriptionId': newSubscription.id,
          'subscription.status': 'active',
          'subscription.currentPeriodEnd': new Date(newSubscription.current_period_end * 1000),
          'subscription.cancelAtPeriodEnd': false,
          plan: validated.targetPlan,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'upgraded successfully',
        data: { isUpgrade: true },
      });
    } else if (isDowngrade) {
      // downgrade: schedule to switch at period end
      // add metadata to current subscription indicating it should downgrade to Pro
      const currentPeriodEnd = subscription.current_period_end;

      // update subscription to cancel at period end and add downgrade metadata
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
        metadata: {
          ...(subscription.metadata || {}),
          downgradeTo: validated.targetPlan,
          userId: user.id,
        },
      });

      // update user record, keep current plan until period ends
      await User.findByIdAndUpdate(user.id, {
        $set: {
          'subscription.cancelAtPeriodEnd': true,
          // keep current plan until period ends, webhook will create Pro subscription
        },
      });

      return NextResponse.json({
        success: true,
        message: 'downgrade scheduled for end of billing period',
        data: { 
          isDowngrade: true,
          scheduledDate: new Date(currentPeriodEnd * 1000).toISOString(),
        },
      });
    } else {
      // same plan or unknown, just update price (shouldnt happen but handle it)
      const subscriptionItem = subscription.items.data[0];
      if (!subscriptionItem) {
        return NextResponse.json(
          { success: false, message: 'subscription item not found' },
          { status: 404 }
        );
      }

      await stripe.subscriptions.update(subscriptionId, {
        items: [{
          id: subscriptionItem.id,
          price: targetPriceId,
        }],
        proration_behavior: 'create_prorations',
      });

      return NextResponse.json({
        success: true,
        message: 'plan updated successfully',
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: error.errors[0].message },
        { status: 400 }
      );
    }
    return handleApiError(error, 'change_plan');
  }
}

