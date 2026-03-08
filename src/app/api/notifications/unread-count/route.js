import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import Notification from '@/models/Notification';
import { handleApiError } from '@/lib/security';

export async function GET(req) {
  const rateLimited = checkRateLimit(req, { limit: 60, windowMinutes: 1 });
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, data: { unreadCount: 0 } });
    }

    await connectDB();
    const unreadCount = await Notification.countDocuments({
      userId: user.id,
      isRead: false,
    });

    return NextResponse.json({
      success: true,
      data: { unreadCount },
    });
  } catch (error) {
    return handleApiError(error, 'notifications_unread');
  }
}
