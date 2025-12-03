import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { getAuthCookies, setAuthCookies } from '@/lib/cookies';
import { verifyRefreshToken, signAccessToken, signRefreshToken } from '@/lib/jwt';
import User from '@/models/User';
import { normalizeRole } from '@/lib/roles';

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

    const rotatedUser = await User.findByIdAndUpdate(
      user._id,
      { $inc: { tokenVersion: 1 } },
      { new: true }
    );
    const nextTokenVersion = rotatedUser?.tokenVersion ?? user.tokenVersion + 1;
    const normalizedRole = normalizeRole(rotatedUser?.role || user.role);

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

