import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import Notification from '@/models/Notification';
import { handleApiError } from '@/lib/errors';

export async function POST(req) {
  const rateLimited = checkRateLimit(req, { limit: 10, windowMinutes: 1 });
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    await Notification.updateMany(
      { userId: user.id, isRead: false },
      { $set: { isRead: true } }
    );

    return NextResponse.json({ success: true, message: 'all marked read' });
  } catch (error) {
    return handleApiError(error, 'notifications_mark_all');
  }
}
