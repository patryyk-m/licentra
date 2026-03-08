import Stripe from 'stripe';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import User from '@/models/User';
import { checkRateLimit } from '@/lib/ratelimit';
import { getStripeRateLimit } from '@/lib/ratelimit';
import { handleApiError } from '@/lib/security';
import { getSafeAppBaseUrl } from '@/lib/security';
import { ok, fail, wrapRoute } from '@/lib/http';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
});

// base url for stripe redirects
function getStripeBaseUrl() {
  return getSafeAppBaseUrl();
}

export const POST = wrapRoute(async function POST(req) {
  const rateLimitResponse = checkRateLimit(req, getStripeRateLimit('portal'));
  if (rateLimitResponse) return rateLimitResponse;
  const user = await authenticateUser(req);
  if (!user) {
    return fail('Unauthorized', 401);
  }

  await connectDB();
  const userDoc = await User.findById(user.id);
  if (!userDoc) {
    return fail('user not found', 404);
  }

  const customerId = userDoc.subscription?.stripeCustomerId;
  if (!customerId) {
    return fail('no stripe customer found', 404);
  }

  // create billing portal session
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getStripeBaseUrl()}/billing`,
  });

  return ok({
    success: true,
    data: {
      url: session.url,
    },
  });
}, (error) => handleApiError(error, 'stripe_portal'));

