import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import User from '@/models/User';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/config/ratelimits';
import { handleApiError } from '@/lib/errors';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
});

export async function GET(req) {
  const rateLimitResponse = checkRateLimit(req, getAuthRateLimit('me'));
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
    const userDoc = await User.findById(user.id).lean();

    if (!userDoc) {
      return NextResponse.json(
        { success: false, message: 'user not found' },
        { status: 404 }
      );
    }

    const plan = userDoc.plan || 'free';
    const subscription = userDoc.subscription || {};
    
    // determine billing cycle from stripe subscription
    let billingCycle = null;
    let scheduledBillingCycleChange = null;
    if (subscription.stripeSubscriptionId) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
        const priceId = stripeSubscription.items.data[0]?.price?.id;
        
        if (priceId === process.env.STRIPE_PRICE_PRO_ANNUAL || 
            priceId === process.env.STRIPE_PRICE_BUSINESS_ANNUAL) {
          billingCycle = 'annual';
        } else if (priceId === process.env.STRIPE_PRICE_PRO || 
                   priceId === process.env.STRIPE_PRICE_BUSINESS) {
          billingCycle = 'monthly';
        }
        
        // check if billing cycle change is scheduled
        if (stripeSubscription.cancel_at_period_end && stripeSubscription.metadata?.changeBillingCycleTo) {
          scheduledBillingCycleChange = stripeSubscription.metadata.changeBillingCycleTo;
        }
      } catch (error) {
        console.error('[billing_info] error fetching stripe subscription:', error);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        plan,
        billingCycle,
        scheduledBillingCycleChange,
        subscription: {
          status: subscription.status || null,
          currentPeriodEnd: subscription.currentPeriodEnd || null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false,
          stripeCustomerId: subscription.stripeCustomerId || null,
          stripeSubscriptionId: subscription.stripeSubscriptionId || null,
        },
      },
    });
  } catch (error) {
    return handleApiError(error, 'billing_info');
  }
}

