import { NextResponse } from 'next/server';
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

export async function POST(req) {
  const rateLimitResponse = checkRateLimit(req, getStripeRateLimit('cancelSubscription'));
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

    // get current subscription to check for scheduled billing cycle change
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    // cancel at period end, do not delete customer
    // if theres a scheduled billing cycle change, clear that metadata
    const updateParams = {
      cancel_at_period_end: true,
    };
    
    if (subscription.metadata?.changeBillingCycleTo) {
      // clear billing cycle change metadata since its canceling
      updateParams.metadata = {
        ...subscription.metadata,
        changeBillingCycleTo: null,
        targetPriceId: null,
      };
    }
    
    await stripe.subscriptions.update(subscriptionId, updateParams);

    // update local record
    await User.findByIdAndUpdate(user.id, {
      $set: {
        'subscription.cancelAtPeriodEnd': true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'subscription will be canceled at period end',
    });
  } catch (error) {
    return handleApiError(error, 'cancel_subscription');
  }
}

