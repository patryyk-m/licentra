import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/config/ratelimits';
import ApiUsage from '@/models/ApiUsage';
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const usageRecords = await ApiUsage.find({
      userId: user.id,
      date: { $gte: firstDayOfMonth },
      $or: [
        { licenseId: null },
        { licenseId: { $exists: false } },
      ],
    }).lean();

    const currentMonthCount = usageRecords.reduce((sum, record) => sum + (record.count || 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        currentMonth: currentMonthCount,
      },
    });
  } catch (error) {
    return handleApiError(error, 'get_usage');
  }
}
