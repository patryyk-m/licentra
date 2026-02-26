import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import Notification from '@/models/Notification';
import { sanitizeObjectId } from '@/lib/sanitize';
import { handleApiError } from '@/lib/errors';

export async function PATCH(req, { params }) {
  const rateLimited = checkRateLimit(req, { limit: 30, windowMinutes: 1 });
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const notifId = id ? sanitizeObjectId(id) : null;
    if (!notifId) {
      return NextResponse.json({ success: false, message: 'invalid notification id' }, { status: 400 });
    }

    await connectDB();

    const notif = await Notification.findOne({ _id: notifId, userId: user.id });
    if (!notif) {
      return NextResponse.json({ success: false, message: 'notification not found' }, { status: 404 });
    }

    const body = await req.json();
    if (body?.isRead === true) {
      notif.isRead = true;
      await notif.save();
    }

    return NextResponse.json({
      success: true,
      data: {
        id: notif._id.toString(),
        isRead: notif.isRead,
      },
    });
  } catch (error) {
    return handleApiError(error, 'notifications_update');
  }
}
