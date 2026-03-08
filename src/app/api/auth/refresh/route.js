import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { getAuthCookies, setAuthCookies } from '@/lib/auth-cookies';
import { verifyRefreshToken, signAccessToken, signRefreshToken } from '@/lib/auth';
import User from '@/models/User';
import { normalizeRole } from '@/lib/authz';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/lib/ratelimit';

export async function POST(req) {
  const rateLimitResponse = checkRateLimit(req, getAuthRateLimit('refresh'));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    await connectDB();
    const { refreshToken } = getAuthCookies(req);

    if (!refreshToken) {
      return NextResponse.json(
        {
          success: false,
          message: 'No refresh token provided',
        },
        { status: 401 }
      );
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.id);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: 'User not found',
        },
        { status: 401 }
      );
    }

    // Check token version
    if (decoded.tokenVersion !== user.tokenVersion) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid refresh token',
        },
        { status: 401 }
      );
    }

    const nextTokenVersion = user.tokenVersion ?? 0;
    const normalizedRole = normalizeRole(user.role);

    // Generate new tokens
    const newAccessToken = signAccessToken({ id: user._id.toString(), role: normalizedRole });
    const newRefreshToken = signRefreshToken({ id: user._id.toString(), tokenVersion: nextTokenVersion });

    // Create response
    const response = NextResponse.json({
      success: true,
      message: 'Tokens refreshed',
    });

    // Set new cookies
    setAuthCookies(response, newAccessToken, newRefreshToken);

    return response;
  } catch (error) {
    console.error('Refresh error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Invalid refresh token',
      },
      { status: 401 }
    );
  }
}

