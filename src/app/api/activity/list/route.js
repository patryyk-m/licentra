import { NextResponse } from 'next/server';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getActivityRateLimit } from '@/config/ratelimits';
import { mockActivity } from '@/lib/mockData';

export async function GET(req) {
  const rateLimited = checkRateLimit(req, getActivityRateLimit('list'));
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    // return mock activity data
    const activities = mockActivity.map((activity) => ({
      ...activity,
      timestamp: activity.timestamp.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: { activities },
    });
  } catch (error) {
    console.error('Activity list error:', error);
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}

