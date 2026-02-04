import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import User from '@/models/User';
import Stripe from 'stripe';
import { handleApiError } from '@/lib/errors';

// initialize stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
});

// test endpoint to manually trigger webhook logic (development only)
export async function POST(req) {
  // only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, message: 'not available in production' },
      { status: 403 }
    );
  }

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

    const customerId = userDoc.subscription?.stripeCustomerId;
    if (!customerId) {
      return NextResponse.json(
        { success: false, message: 'no stripe customer id found' },
        { status: 404 }
      );
    }

    // get latest subscription for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return NextResponse.json(
        { success: false, message: 'no subscription found' },
        { status: 404 }
      );
    }

    const subscription = subscriptions.data[0];
    const priceId = subscription.items.data[0]?.price?.id;
    
    // determine plan from price id (check both monthly and annual)
    let plan = 'free';
    if (priceId === process.env.STRIPE_PRICE_PRO || priceId === process.env.STRIPE_PRICE_PRO_ANNUAL) {
      plan = 'pro';
    } else if (priceId === process.env.STRIPE_PRICE_BUSINESS || priceId === process.env.STRIPE_PRICE_BUSINESS_ANNUAL) {
      plan = 'business';
    }

    // map stripe status
    const statusMap = {
      active: 'active',
      trialing: 'trialing',
      past_due: 'past_due',
      canceled: 'canceled',
      unpaid: 'unpaid',
    };
    const status = statusMap[subscription.status] || null;

    // update user
    await User.findByIdAndUpdate(user.id, {
      $set: {
        plan,
        'subscription.stripeSubscriptionId': subscription.id,
        'subscription.status': status,
        'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
        'subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'subscription synced',
      data: {
        plan,
        status,
        subscriptionId: subscription.id,
      },
    });
  } catch (error) {
    return handleApiError(error, 'stripe_webhook_test');
  }
}

