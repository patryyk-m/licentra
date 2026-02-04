import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/config/ratelimits';
import SecurityLog from '@/models/SecurityLog';
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

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    // security relevant events only
    const securityEvents = [
      'login_success',
      'login_failure',
      'logout',
      'password_changed',
      'all_sessions_revoked',
      'data_export',
      'account_deletion_requested',
      'access_denied',
      'rate_limit_exceeded',
    ];

    const logs = await SecurityLog.find({
      userId: user.id,
      event: { $in: securityEvents },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();

    const total = await SecurityLog.countDocuments({
      userId: user.id,
      event: { $in: securityEvents },
    });

    return NextResponse.json({
      success: true,
      data: {
        logs: logs.map((log) => ({
          id: log._id.toString(),
          event: log.event,
          ip: log.ip,
          userAgent: log.userAgent,
          resource: log.resource || '',
          reason: log.reason || '',
          timestamp: log.createdAt,
        })),
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    return handleApiError(error, 'get_audit_log');
  }
}


