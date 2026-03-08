import { connectDB } from '@/lib/db';
import { checkRateLimit, getAuthRateLimit } from '@/lib/ratelimit';
import SecurityLog from '@/models/SecurityLog';
import { handleApiError, USER_AUDIT_EVENT_TYPES } from '@/lib/security';
import { ok, withAuth, wrapRoute } from '@/lib/http';

const getHandler = withAuth(async (req, user) => {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
  const rawOffset = parseInt(searchParams.get('offset') || '0', 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 100);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  const logs = await SecurityLog.find({
    userId: user.id,
    event: { $in: USER_AUDIT_EVENT_TYPES },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(offset)
    .lean();

  const total = await SecurityLog.countDocuments({
    userId: user.id,
    event: { $in: USER_AUDIT_EVENT_TYPES },
  });

  return ok({
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
}, { unauthorizedMessage: 'Unauthorized' });

export const GET = wrapRoute(async function GET(req) {
  const rateLimitResponse = checkRateLimit(req, getAuthRateLimit('me'));
  if (rateLimitResponse) return rateLimitResponse;

  return await getHandler(req);
}, (error) => handleApiError(error, 'get_audit_log'));


