import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { connectDB } from '@/lib/db';
import User from '@/models/User';
import { handleApiError } from '@/lib/security';

// initialize stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
});

// webhook secret from env
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// disable body parsing, we need raw body for signature verification
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    await connectDB();

    // get raw body for signature verification
    const body = await req.text();
    
    if (!webhookSecret) {
      console.error('[stripe_webhook] STRIPE_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { success: false, message: 'webhook configuration error' },
        { status: 500 }
      );
    }

    // get signature from headers
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json(
        { success: false, message: 'missing signature' },
        { status: 400 }
      );
    }

    // verify webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('[stripe_webhook] signature verification failed:', err.message);
      return NextResponse.json(
        { success: false, message: 'invalid signature' },
        { status: 400 }
      );
    }

    // handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        try {
          await handleCheckoutCompleted(session);
        } catch (error) {
          console.error('[stripe_webhook] error handling checkout.session.completed:', error);
          throw error; // rethrow to trigger webhook retry
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        try {
          await handlePaymentSucceeded(invoice);
        } catch (error) {
          console.error('[stripe_webhook] error handling invoice.payment_succeeded:', error);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        try {
          await handlePaymentFailed(invoice);
        } catch (error) {
          console.error('[stripe_webhook] error handling invoice.payment_failed:', error);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        try {
          await handleSubscriptionUpdated(subscription);
        } catch (error) {
          console.error('[stripe_webhook] error handling customer.subscription.updated:', error);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        try {
          await handleSubscriptionDeleted(subscription);
        } catch (error) {
          console.error('[stripe_webhook] error handling customer.subscription.deleted:', error);
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return handleApiError(error, 'stripe_webhook');
  }
}

// handle checkout.session.completed
async function handleCheckoutCompleted(session) {
  const userId = session.metadata?.userId;
  const plan = session.metadata?.plan;

  if (!userId || !plan) {
    console.error('[stripe_webhook] missing metadata in checkout session');
    return;
  }

  // get subscription if available
  const subscriptionId = session.subscription;
  if (!subscriptionId) {
    console.error('[stripe_webhook] no subscription id in checkout session');
    return;
  }

  // verify user exists
  const userExists = await User.findById(userId);
  if (!userExists) {
    console.error('[stripe_webhook] user not found:', userId);
    return;
  }

  // fetch subscription from stripe
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  
  // determine plan from metadata (more reliable than price id for initial checkout)
  const targetPlan = plan === 'pro' ? 'pro' : 'business';
  const mappedStatus = mapStripeStatus(subscription.status);
  
  // update user - always set plan on checkout completion
  // even if status is "trialing" (for Pro 7-day trial), we set the plan
  const periodEnd = toDate(subscription.current_period_end);
  const updated = await updateUserSubscription(userId, {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    status: mappedStatus,
    ...(periodEnd && { currentPeriodEnd: periodEnd }),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    plan: targetPlan, // always set plan on checkout completion
  });
  
  if (!updated) {
    console.error('[stripe_webhook] failed to update user:', userId);
  }
}

// handle invoice.payment_succeeded
async function handlePaymentSucceeded(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = subscription.customer;

  // find user by customer id
  const user = await User.findOne({ 'subscription.stripeCustomerId': customerId });
  if (!user) {
    console.error('[stripe_webhook] user not found for customer:', customerId);
    return;
  }

  // update subscription status
  const periodEnd = toDate(subscription.current_period_end);
  await updateUserSubscription(user._id.toString(), {
    status: mapStripeStatus(subscription.status),
    ...(periodEnd && { currentPeriodEnd: periodEnd }),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

// handle invoice.payment_failed
async function handlePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = subscription.customer;

  // find user by customer id
  const user = await User.findOne({ 'subscription.stripeCustomerId': customerId });
  if (!user) {
    console.error('[stripe_webhook] user not found for customer:', customerId);
    return;
  }

  // mark as past_due
  const periodEnd = toDate(subscription.current_period_end);
  await updateUserSubscription(user._id.toString(), {
    status: 'past_due',
    ...(periodEnd && { currentPeriodEnd: periodEnd }),
  });
}

// handle customer.subscription.updated
async function handleSubscriptionUpdated(subscription) {
  const customerId = subscription.customer;

  // find user by customer id
  const user = await User.findOne({ 'subscription.stripeCustomerId': customerId });
  if (!user) {
    console.error('[stripe_webhook] user not found for customer:', customerId);
    return;
  }

  // determine plan from subscription
  const priceId = subscription.items.data[0]?.price?.id;
  let plan = user.plan; // keep existing plan if price doesnt match
  
  // check both monthly and annual prices
  if (priceId === process.env.STRIPE_PRICE_PRO || priceId === process.env.STRIPE_PRICE_PRO_ANNUAL) {
    plan = 'pro';
  } else if (priceId === process.env.STRIPE_PRICE_BUSINESS || priceId === process.env.STRIPE_PRICE_BUSINESS_ANNUAL) {
    plan = 'business';
  }

  // if webhook payload missing current_period_end, fetch full subscription from stripe
  let periodEnd = toDate(subscription.current_period_end);
  if (!periodEnd && subscription.id) {
    try {
      const full = await stripe.subscriptions.retrieve(subscription.id);
      periodEnd = toDate(full.current_period_end);
    } catch (e) {
      console.error('[stripe_webhook] failed to retrieve subscription:', e.message);
    }
  }

  // update subscription - only set currentPeriodEnd when we have valid date
  await updateUserSubscription(user._id.toString(), {
    stripeSubscriptionId: subscription.id,
    status: mapStripeStatus(subscription.status),
    ...(periodEnd && { currentPeriodEnd: periodEnd }),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    ...(plan ? { plan } : {}), // always update plan if we can determine it
  });
}

// handle customer.subscription.deleted
async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;

  // find user by customer id
  const user = await User.findOne({ 'subscription.stripeCustomerId': customerId });
  if (!user) {
    console.error('[stripe_webhook] user not found for customer:', customerId);
    return;
  }

  // check if this is a scheduled downgrade or billing cycle change
  const downgradeTo = subscription.metadata?.downgradeTo;
  const changeBillingCycleTo = subscription.metadata?.changeBillingCycleTo;
  const targetPriceId = subscription.metadata?.targetPriceId;
  
  if (changeBillingCycleTo && targetPriceId) {
    // scheduled billing cycle change, create new subscription with new billing cycle
    try {
      const newSubscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: targetPriceId }],
        metadata: {
          userId: user._id.toString(),
          plan: subscription.metadata?.plan || user.plan,
        },
      });

      // update user with new subscription (same plan, different billing cycle)
      const newPeriodEnd = toDate(newSubscription.current_period_end);
      await updateUserSubscription(user._id.toString(), {
        stripeSubscriptionId: newSubscription.id,
        status: mapStripeStatus(newSubscription.status),
        ...(newPeriodEnd && { currentPeriodEnd: newPeriodEnd }),
        cancelAtPeriodEnd: false,
        plan: subscription.metadata?.plan || user.plan, // plan stays the same
      });
      
      return;
    } catch (error) {
      console.error('[stripe_webhook] error creating new subscription for billing cycle change:', error);
      // fall through to downgrade to free
    }
  } else if (downgradeTo === 'pro' || downgradeTo === 'business') {
    // determine if original subscription was annual or monthly
    const wasAnnual = subscription.items.data[0]?.price?.id === process.env.STRIPE_PRICE_PRO_ANNUAL ||
                     subscription.items.data[0]?.price?.id === process.env.STRIPE_PRICE_BUSINESS_ANNUAL;
    
    // create new subscription for downgraded plan (preserve billing cycle)
    const targetPriceIdForDowngrade = downgradeTo === 'pro'
      ? (wasAnnual ? process.env.STRIPE_PRICE_PRO_ANNUAL : process.env.STRIPE_PRICE_PRO)
      : (wasAnnual ? process.env.STRIPE_PRICE_BUSINESS_ANNUAL : process.env.STRIPE_PRICE_BUSINESS);

    if (targetPriceIdForDowngrade) {
      try {
        const newSubscription = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: targetPriceIdForDowngrade }],
          metadata: {
            userId: user._id.toString(),
            plan: downgradeTo,
          },
        });

        // update user with new subscription
        const downgradePeriodEnd = toDate(newSubscription.current_period_end);
        await updateUserSubscription(user._id.toString(), {
          stripeSubscriptionId: newSubscription.id,
          status: mapStripeStatus(newSubscription.status),
          ...(downgradePeriodEnd && { currentPeriodEnd: downgradePeriodEnd }),
          cancelAtPeriodEnd: false,
          plan: downgradeTo,
        });
        return;
      } catch (error) {
        console.error('[stripe_webhook] error creating downgrade subscription:', error);
        // fall through to downgrade to free
      }
    }
  }

  // no downgrade scheduled or error - downgrade to free
  await updateUserSubscription(user._id.toString(), {
    status: 'canceled',
    plan: 'free',
    cancelAtPeriodEnd: false,
  });
}

// safely convert stripe unix timestamp (seconds) to Date - only when valid
function toDate(timestamp) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null;
  const d = new Date(timestamp * 1000);
  return isNaN(d.getTime()) ? null : d;
}

// map stripe subscription status to our status
function mapStripeStatus(stripeStatus) {
  const statusMap = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid: 'unpaid',
  };
  return statusMap[stripeStatus] || null;
}

// update user subscription
async function updateUserSubscription(userId, updates) {
  const updateData = {};
  
  if (updates.stripeCustomerId) {
    updateData['subscription.stripeCustomerId'] = updates.stripeCustomerId;
  }
  if (updates.stripeSubscriptionId) {
    updateData['subscription.stripeSubscriptionId'] = updates.stripeSubscriptionId;
  }
  if (updates.status !== undefined) {
    updateData['subscription.status'] = updates.status;
  }
  if (updates.currentPeriodEnd) {
    const d = updates.currentPeriodEnd;
    if (d instanceof Date && !isNaN(d.getTime())) {
      updateData['subscription.currentPeriodEnd'] = d;
    }
  }
  if (updates.cancelAtPeriodEnd !== undefined) {
    updateData['subscription.cancelAtPeriodEnd'] = updates.cancelAtPeriodEnd;
  }
  if (updates.plan) {
    updateData.plan = updates.plan;
  }

  if (Object.keys(updateData).length > 0) {
    const result = await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true });
    return result;
  }
  
  return null;
}

