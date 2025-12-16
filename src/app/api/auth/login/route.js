import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import User from '@/models/User';
import { verifyPassword } from '@/lib/crypto';
import { signAccessToken, signRefreshToken } from '@/lib/jwt';
import { normalizeRole } from '@/lib/roles';
import { setAuthCookies } from '@/lib/cookies';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/config/ratelimits';
import { logAuthEvent, SECURITY_EVENTS } from '@/lib/security-logger';
import { handleApiError } from '@/lib/errors';

const loginSchema = z.object({
  emailOrUsername: z.string(),
  password: z.string(),
});

export async function POST(req) {
  try {
    // Check rate limit
    const rateLimitResponse = checkRateLimit(req, getAuthRateLimit('login'));
    if (rateLimitResponse) return rateLimitResponse;

    await connectDB();
    const body = await req.json();

    // Validate input
    const { emailOrUsername, password } = loginSchema.parse(body);

    // Find user by email or username
    const user = await User.findOne({
      $or: [
        { email: emailOrUsername.toLowerCase() },
        { username: emailOrUsername.toLowerCase() },
      ],
    });

    if (!user) {
      logAuthEvent(SECURITY_EVENTS.LOGIN_FAILURE, null, req, { reason: 'user_not_found' }).catch(() => {});
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid credentials',
        },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      logAuthEvent(SECURITY_EVENTS.LOGIN_FAILURE, user._id.toString(), req, { reason: 'invalid_password' }).catch(() => {});
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid credentials',
        },
        { status: 401 }
      );
    }

    const normalizedRole = normalizeRole(user.role);

    const updatedTokenDoc = await User.findByIdAndUpdate(
      user._id,
      { $inc: { tokenVersion: 1 } },
      { new: true, select: 'tokenVersion' }
    );
    const rotatedTokenVersion = updatedTokenDoc?.tokenVersion ?? (user.tokenVersion ?? 0) + 1;

    // Generate tokens
    const accessToken = signAccessToken({ id: user._id.toString(), role: normalizedRole });
    const refreshToken = signRefreshToken({ id: user._id.toString(), tokenVersion: rotatedTokenVersion });

    // Create response
    const response = NextResponse.json({
      success: true,
      data: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: normalizedRole,
        plan: user.plan || 'free',
        partnerApps: Array.isArray(user.partnerApps)
          ? user.partnerApps.map((appId) => appId?.toString())
          : [],
        developerApps: Array.isArray(user.developerApps)
          ? user.developerApps.map((appId) => appId?.toString())
          : [],
      },
    });

    // Set cookies
    setAuthCookies(response, accessToken, refreshToken);

    // Log successful login (fire and forget)
    logAuthEvent(SECURITY_EVENTS.LOGIN_SUCCESS, user._id.toString(), req).catch(() => {});

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          message: error.errors[0].message,
        },
        { status: 400 }
      );
    }

    return handleApiError(error, 'login');
  }
}

