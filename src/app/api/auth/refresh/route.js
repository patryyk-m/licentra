import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { getAuthCookies } from '@/lib/cookies';
import { verifyRefreshToken } from '@/lib/jwt';
import { signAccessToken, signRefreshToken } from '@/lib/jwt';
import { setAuthCookies } from '@/lib/cookies';
import User from '@/models/User';

export async function POST(req) {
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

    // Generate new tokens
    const newAccessToken = signAccessToken({ id: user._id.toString(), role: user.role });
    const newRefreshToken = signRefreshToken({ id: user._id.toString(), tokenVersion: user.tokenVersion });

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

