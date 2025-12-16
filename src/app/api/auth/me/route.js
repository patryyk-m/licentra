import { NextResponse } from 'next/server';
import { authenticateUser } from '@/middleware/auth';
import { normalizeRole } from '@/lib/roles';
import { connectDB } from '@/lib/db';
import User from '@/models/User';
import App from '@/models/App';
import License from '@/models/License';
import AppInvite from '@/models/AppInvite';
import { clearAuthCookies } from '@/lib/cookies';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/config/ratelimits';

export async function GET(req) {
  const rateLimitResponse = checkRateLimit(req, getAuthRateLimit('me'));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await authenticateUser(req);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized',
        },
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

    const subscription = userDoc.subscription || {};

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: normalizeRole(user.role),
          plan: user.plan || 'free',
          partnerApps: Array.isArray(user.partnerApps)
            ? user.partnerApps.map((appId) => appId?.toString())
            : [],
          developerApps: Array.isArray(user.developerApps)
            ? user.developerApps.map((appId) => appId?.toString())
            : [],
          subscription: {
            status: subscription.status || null,
            currentPeriodEnd: subscription.currentPeriodEnd || null,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false,
          },
        },
      },
    });
  } catch (error) {
    const { handleApiError } = await import('@/lib/errors');
    return handleApiError(error, 'get_me');
  }
}

export async function DELETE(req) {
  const rateLimitResponse = checkRateLimit(req, getAuthRateLimit('delete'));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await authenticateUser(req);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    await connectDB();

    // require password confirmation for account deletion
    const body = await req.json().catch(() => ({}));
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        {
          success: false,
          message: 'password confirmation required for account deletion',
        },
        { status: 400 }
      );
    }

    // verify password
    const userDoc = await User.findById(user.id).select('+passwordHash');
    if (!userDoc) {
      return NextResponse.json(
        { success: false, message: 'user not found' },
        { status: 404 }
      );
    }

    const { verifyPassword } = await import('@/lib/crypto');
    const isValidPassword = await verifyPassword(password, userDoc.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json(
        { success: false, message: 'incorrect password' },
        { status: 401 }
      );
    }

    // log deletion request
    const SecurityLog = (await import('@/models/SecurityLog')).default;
    const { getClientIp, getUserAgent } = await import('@/lib/security-logger');
    await SecurityLog.create({
      userId: user.id,
      event: 'account_deletion_requested',
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      details: { timestamp: new Date().toISOString() },
    });

    const ownedAppCount = await App.countDocuments({ ownerId: user.id });
    if (ownedAppCount > 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'transfer or delete your applications before removing this account',
        },
        { status: 409 }
      );
    }

    await License.updateMany(
      { createdBy: user.id },
      { $set: { createdBy: null } }
    );

    await AppInvite.updateMany(
      { createdBy: user.id },
      { $set: { createdBy: null } }
    );

    await AppInvite.updateMany(
      { redeemedBy: user.id },
      { $unset: { redeemedBy: '' } }
    );

    await User.deleteOne({ _id: user.id });

    const response = NextResponse.json({
      success: true,
      message: 'account deleted',
    });
    clearAuthCookies(response);

    return response;
  } catch (error) {
    const { handleApiError } = await import('@/lib/errors');
    return handleApiError(error, 'delete_account');
  }
}

