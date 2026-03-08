import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { authenticateUser } from '@/middleware/auth';
import User from '@/models/User';
import { connectDB } from '@/lib/db';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/lib/ratelimit';
import { logAuthEvent, SECURITY_EVENTS } from '@/lib/security';

export async function POST(req) {
  const rateLimitResponse = checkRateLimit(req, getAuthRateLimit('logout'));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await authenticateUser(req);
    if (user) {
      await connectDB();
      await User.updateOne(
        { _id: user.id },
        { $inc: { tokenVersion: 1 } }
      ).catch(() => {});
      logAuthEvent(SECURITY_EVENTS.LOGOUT, user.id, req).catch(() => {});
    }

    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });

    // Clear cookies
    clearAuthCookies(response);

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

