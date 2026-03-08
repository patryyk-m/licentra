import { connectDB } from '@/lib/db';
import { checkRateLimit } from '@/lib/ratelimit';
import Notification from '@/models/Notification';
import { sanitizeObjectId } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { ok, parseJson, withAuth, wrapRoute } from '@/lib/http';

const postHandler = withAuth(async (req, user) => {
  await connectDB();

  const body = await parseJson(req);
  const appId = sanitizeObjectId(body?.appId);

  const query = { userId: user.id };
  if (appId) query.appId = appId;

  const result = await Notification.deleteMany(query);

  return ok({
    success: true,
    message: 'all notifications deleted',
    data: { deletedCount: result.deletedCount },
  });
}, { unauthorizedMessage: 'Unauthorized' });

export const POST = wrapRoute(async function POST(req) {
  const rateLimited = checkRateLimit(req, { limit: 10, windowMinutes: 1 });
  if (rateLimited) return rateLimited;

  return await postHandler(req);
}, (error) => handleApiError(error, 'notifications_delete_all'));
