import { connectDB } from '@/lib/db';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/lib/ratelimit';
import User from '@/models/User';
import SecurityLog from '@/models/SecurityLog';
import { logAuthEvent, SECURITY_EVENTS, getClientIp, getUserAgent } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { ok, withAuth, wrapRoute, fail } from '@/lib/http';
import { requireStepUp, clearAuthCookies } from '@/lib/auth-cookies';

const getHandler = withAuth(async (_req, user) => {
  await connectDB();

  // get recent login events as session history
  const allLogs = await SecurityLog.find({
    userId: user.id,
    event: { $in: ['login_success', 'password_changed', 'logout', 'all_sessions_revoked'] },
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  // only show events since the most recent revoke (cleaner view after revoke)
  const lastRevokeIndex = allLogs.findIndex((l) => l.event === 'all_sessions_revoked');
  const recentLogins = lastRevokeIndex >= 0
    ? allLogs.slice(0, lastRevokeIndex + 1)
    : allLogs;

  const sessions = recentLogins.map((log) => ({
    id: log._id.toString(),
    event: log.event,
    ip: log.ip,
    userAgent: log.userAgent,
    timestamp: log.createdAt,
    isCurrent: log.event === 'login_success' && log._id.toString() === recentLogins[0]?._id?.toString(),
  }));

  return ok({
    success: true,
    data: { sessions },
  });
}, { unauthorizedMessage: 'Unauthorized' });

const deleteHandler = withAuth(async (req, user) => {
  const stepUpOk = await requireStepUp(req, user);
  if (!stepUpOk) {
    return fail('step-up required', 403);
  }

  await connectDB();

  // increment token version to invalidate all sessions
  await User.findByIdAndUpdate(user.id, {
    $inc: { tokenVersion: 1 },
  });

  logAuthEvent(SECURITY_EVENTS.ALL_SESSIONS_REVOKED, user.id, req).catch(() => {});

  const response = ok({
    success: true,
    message: 'all sessions have been revoked. please log in again.',
  });
  clearAuthCookies(response);
  return response;
}, { unauthorizedMessage: 'Unauthorized' });

// get current session info
export const GET = wrapRoute(async function GET(req) {
  const rateLimitResponse = checkRateLimit(req, getAuthRateLimit('me'));
  if (rateLimitResponse) return rateLimitResponse;

  return await getHandler(req);
}, (error) => handleApiError(error, 'get_sessions'));

// revoke all sessions (increment token version)
export const DELETE = wrapRoute(async function DELETE(req) {
  const rateLimitResponse = checkRateLimit(req, { limit: 5, windowMinutes: 15 });
  if (rateLimitResponse) return rateLimitResponse;

  return await deleteHandler(req);
}, (error) => handleApiError(error, 'revoke_sessions'));

