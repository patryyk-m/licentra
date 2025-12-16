import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import User from '@/models/User';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/config/ratelimits';
import { handleApiError } from '@/lib/errors';

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

    return NextResponse.json({
      success: true,
      data: {
        plan,
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

