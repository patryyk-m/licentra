import Stripe from 'stripe';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import User from '@/models/User';
import { checkRateLimit } from '@/lib/ratelimit';
import { getStripeRateLimit } from '@/lib/ratelimit';
import { handleApiError } from '@/lib/security';
import { requireStepUp } from '@/lib/auth-cookies';
import { SECURITY_EVENTS, logAdminAction } from '@/lib/security';
import { ok, fail, wrapRoute } from '@/lib/http';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
});

export const POST = wrapRoute(async function POST(req) {
  const rateLimitResponse = checkRateLimit(req, getStripeRateLimit('cancelSubscription'));
  if (rateLimitResponse) return rateLimitResponse;
  const user = await authenticateUser(req);
  if (!user) {
    return fail('Unauthorized', 401);
  }

  const stepUpOk = await requireStepUp(req, user);
  if (!stepUpOk) {
    return fail('step-up required', 403);
  }

  await connectDB();
  const userDoc = await User.findById(user.id);
  if (!userDoc) {
    return fail('user not found', 404);
  }

  const subscriptionId = userDoc.subscription?.stripeSubscriptionId;
  if (!subscriptionId) {
    return fail('no active subscription found', 404);
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

  await logAdminAction({
    actorUserId: user.id,
    action: SECURITY_EVENTS.SUBSCRIPTION_CANCELLED,
    targetType: 'subscription',
    targetId: subscriptionId,
    metadata: {},
    req,
  });

  return ok({
    success: true,
    message: 'subscription will be canceled at period end',
  });
}, (error) => handleApiError(error, 'cancel_subscription'));

