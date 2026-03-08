import { z } from 'zod';
import Stripe from 'stripe';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import User from '@/models/User';
import { checkRateLimit } from '@/lib/ratelimit';
import { getStripeRateLimit } from '@/lib/ratelimit';
import { handleApiError } from '@/lib/security';
import { getSafeAppBaseUrl } from '@/lib/security';
import { ok, fail } from '@/lib/http';

const checkoutSchema = z.object({
  plan: z.enum(['pro', 'business']),
  billingCycle: z.enum(['monthly', 'annual']).optional().default('monthly'),
}).strict();

// initialize stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
});

// base url for stripe redirects
function getStripeBaseUrl() {
  return getSafeAppBaseUrl();
}

export async function POST(req) {
  const rateLimitResponse = checkRateLimit(req, getStripeRateLimit('checkout'));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return fail('Unauthorized', 401);
    }

    await connectDB();
    const body = await req.json();
    const validated = checkoutSchema.parse(body);

    // map plan and billing cycle to price id
    let priceId;
    if (validated.billingCycle === 'annual') {
      priceId = validated.plan === 'pro'
        ? process.env.STRIPE_PRICE_PRO_ANNUAL
        : process.env.STRIPE_PRICE_BUSINESS_ANNUAL;
    } else {
      priceId = validated.plan === 'pro'
        ? process.env.STRIPE_PRICE_PRO
        : process.env.STRIPE_PRICE_BUSINESS;
    }

    if (!priceId) {
      return fail('price configuration error', 500);
    }

    // get user document
    const userDoc = await User.findById(user.id);
    if (!userDoc) {
      return fail('user not found', 404);
    }

    // get or create stripe customer
    let customerId = userDoc.subscription?.stripeCustomerId;
    let isNewCustomer = false;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userDoc.email,
        metadata: {
          userId: user.id,
        },
      });
      customerId = customer.id;
      isNewCustomer = true;
      
      // save customer id
      await User.findByIdAndUpdate(user.id, {
        'subscription.stripeCustomerId': customerId,
      });
    } else {
      // check if customer has any previous subscriptions (even canceled ones)
      // if they do, theyre not eligible for trial
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: 'all',
          limit: 100,
        });

        // if customer has any subscriptions (active, canceled, past_due, etc.), theyre not new
        if (subscriptions.data.length > 0) {
          isNewCustomer = false;
        } else {
          isNewCustomer = true;
        }

        // cancel ALL existing active subscriptions for this customer
        // this prevents duplicate subscriptions when upgrading via checkout
        for (const sub of subscriptions.data) {
          // cancel active or trialing subscriptions
          if (['active', 'trialing'].includes(sub.status)) {
            try {
              await stripe.subscriptions.cancel(sub.id);
            } catch (error) {
              console.error(`[stripe_checkout] error canceling subscription ${sub.id}:`, error);
            }
          }
        }
      } catch (error) {
        console.error('[stripe_checkout] error listing subscriptions:', error);
        // continue with checkout even if we cant cancel existing ones
        // assume not new customer if we cant check
        isNewCustomer = false;
      }
    }

    // build checkout session params
    const sessionParams = {
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${getStripeBaseUrl()}/billing?success=1`,
      cancel_url: `${getStripeBaseUrl()}/pricing`,
      metadata: {
        userId: user.id,
        plan: validated.plan,
      },
    };

    // add trial period for pro plan only (monthly only, no trial on annual, new customers only)
    if (validated.plan === 'pro' && validated.billingCycle === 'monthly' && isNewCustomer) {
      sessionParams.subscription_data = {
        trial_period_days: 7,
      };
    }
    // business plan has no trial, annual plans have no trial, existing customers get no trial

    // create checkout session
    const session = await stripe.checkout.sessions.create(sessionParams);

    return ok({
      success: true,
      data: {
        url: session.url,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.errors[0].message, 400);
    }
    return handleApiError(error, 'stripe_checkout');
  }
}

