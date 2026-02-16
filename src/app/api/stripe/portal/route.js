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

// base url for stripe redirects
function getStripeBaseUrl() {

  const url = process.env.NEXT_PUBLIC_APP_URL;
  
  if (url) {
    return url.replace(/\/$/, '');
  }
  
  // fallback to production if not set
  return 'https://licentra.dev';
}

export async function POST(req) {
  const rateLimitResponse = checkRateLimit(req, getStripeRateLimit('portal'));
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

    const customerId = userDoc.subscription?.stripeCustomerId;
    if (!customerId) {
      return NextResponse.json(
        { success: false, message: 'no stripe customer found' },
        { status: 404 }
      );
    }

    // create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getStripeBaseUrl()}/billing`,
    });

    return NextResponse.json({
      success: true,
      data: {
        url: session.url,
      },
    });
  } catch (error) {
    return handleApiError(error, 'stripe_portal');
  }
}

