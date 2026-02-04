import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/config/ratelimits';
import User from '@/models/User';
import SecurityLog from '@/models/SecurityLog';
import { logAuthEvent, SECURITY_EVENTS, getClientIp, getUserAgent } from '@/lib/security-logger';
import { handleApiError } from '@/lib/errors';

// get current session info
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

    // get recent login events as session history
    const recentLogins = await SecurityLog.find({
      userId: user.id,
      event: { $in: ['login_success', 'password_changed', 'logout'] },
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const sessions = recentLogins.map((log) => ({
      id: log._id.toString(),
      event: log.event,
      ip: log.ip,
      userAgent: log.userAgent,
      timestamp: log.createdAt,
      isCurrent: log.event === 'login_success' && log._id.toString() === recentLogins[0]?._id?.toString(),
    }));

    return NextResponse.json({
      success: true,
      data: { sessions },
    });
  } catch (error) {
    return handleApiError(error, 'get_sessions');
  }
}

// revoke all sessions (increment token version)
export async function DELETE(req) {
  const rateLimitResponse = checkRateLimit(req, { limit: 5, windowMinutes: 15 });
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

    // increment token version to invalidate all sessions
    await User.findByIdAndUpdate(user.id, {
      $inc: { tokenVersion: 1 },
    });

    // log security event
    await SecurityLog.create({
      userId: user.id,
      event: 'all_sessions_revoked',
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      details: { timestamp: new Date().toISOString() },
    });

    logAuthEvent(SECURITY_EVENTS.LOGOUT, user.id, req, { action: 'revoke_all_sessions' }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'all sessions have been revoked. please log in again.',
    });
  } catch (error) {
    return handleApiError(error, 'revoke_sessions');
  }
}

