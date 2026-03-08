import { connectDB } from '@/lib/db';
import { checkRateLimit } from '@/lib/ratelimit';
import Notification from '@/models/Notification';
import { sanitizeObjectId } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { fail, ok, withAuth, wrapRoute } from '@/lib/http';

const patchHandler = withAuth(async (req, user, { params }) => {
  const { id } = await params;
  const notifId = id ? sanitizeObjectId(id) : null;
  if (!notifId) {
    return fail('invalid notification id', 400);
  }

  await connectDB();

  const notif = await Notification.findOne({ _id: notifId, userId: user.id });
  if (!notif) {
    return fail('notification not found', 404);
  }

  const body = await req.json();
  if (body?.isRead === true) {
    notif.isRead = true;
    await notif.save();
  }

  return ok({
    success: true,
    data: {
      id: notif._id.toString(),
      isRead: notif.isRead,
    },
  });
}, { unauthorizedMessage: 'Unauthorized' });

const deleteHandler = withAuth(async (_req, user, { params }) => {
  const { id } = await params;
  const notifId = id ? sanitizeObjectId(id) : null;
  if (!notifId) {
    return fail('invalid notification id', 400);
  }

  await connectDB();

  const result = await Notification.deleteOne({ _id: notifId, userId: user.id });
  if (result.deletedCount === 0) {
    return fail('notification not found', 404);
  }

  return ok({ success: true, data: { deleted: true } });
}, { unauthorizedMessage: 'Unauthorized' });

export const PATCH = wrapRoute(async function PATCH(req, { params }) {
  const rateLimited = checkRateLimit(req, { limit: 30, windowMinutes: 1 });
  if (rateLimited) return rateLimited;

  return await patchHandler(req, { params });
}, (error) => handleApiError(error, 'notifications_update'));

export const DELETE = wrapRoute(async function DELETE(req, { params }) {
  const rateLimited = checkRateLimit(req, { limit: 30, windowMinutes: 1 });
  if (rateLimited) return rateLimited;

  return await deleteHandler(req, { params });
}, (error) => handleApiError(error, 'notifications_delete'));
