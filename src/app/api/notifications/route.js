import { connectDB } from '@/lib/db';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/lib/ratelimit';
import Notification from '@/models/Notification';
import { handleApiError } from '@/lib/security';
import { ok, withAuth, wrapRoute } from '@/lib/http';

const getHandler = withAuth(async (req, user) => {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const severity = searchParams.get('severity');
  const appId = searchParams.get('appId');
  const type = searchParams.get('type');
  const unreadOnly = searchParams.get('unreadOnly') === 'true';

  const query = { userId: user.id };
  if (severity) query.severity = severity;
  if (appId) query.appId = appId;
  if (type) query.type = type;
  if (unreadOnly) query.isRead = false;

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const unreadCount = await Notification.countDocuments({
    userId: user.id,
    isRead: false,
  });
  const unreadCountForApp = appId
    ? await Notification.countDocuments({ userId: user.id, appId, isRead: false })
    : unreadCount;

  const sanitized = notifications.map((n) => ({
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    message: n.message,
    severity: n.severity,
    metadata: n.metadata || {},
    isRead: n.isRead,
    appId: n.appId?.toString(),
    licenseId: n.licenseId?.toString(),
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  }));

  return ok({
    success: true,
    data: {
      notifications: sanitized,
      unreadCount: appId ? unreadCountForApp : unreadCount,
    },
  });
}, { unauthorizedMessage: 'Unauthorized' });

export const GET = wrapRoute(async function GET(req) {
  const rateLimited = checkRateLimit(req, getAuthRateLimit('me'));
  if (rateLimited) return rateLimited;

  return await getHandler(req);
}, (error) => handleApiError(error, 'notifications_list'));
