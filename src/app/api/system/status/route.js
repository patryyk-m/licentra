import { NextResponse } from 'next/server';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { connectDB } from '@/lib/db';
import { mockSystemMetrics } from '@/lib/mockData';

export async function GET(req) {
  const rateLimited = checkRateLimit(req, 60, 1);
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    // check database connection
    let dbConnected = false;
    try {
      await connectDB();
      dbConnected = true;
    } catch (e) {
      dbConnected = false;
    }

    const metrics = {
      ...mockSystemMetrics,
      databaseConnected: dbConnected,
    };

    return NextResponse.json({
      success: true,
      data: { metrics },
    });
  } catch (error) {
    console.error('System status error:', error);
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}

