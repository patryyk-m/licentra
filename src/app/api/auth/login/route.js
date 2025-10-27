import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import User from '@/models/User';
import { verifyPassword } from '@/lib/crypto';
import { signAccessToken, signRefreshToken } from '@/lib/jwt';
import { setAuthCookies } from '@/lib/cookies';
import { checkRateLimit } from '@/lib/ratelimit';

const loginSchema = z.object({
  emailOrUsername: z.string(),
  password: z.string(),
});

export async function POST(req) {
  try {
    // Check rate limit
    const rateLimitResponse = checkRateLimit(req, 10, 1);
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
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid credentials',
        },
        { status: 401 }
      );
    }

    // Generate tokens
    const accessToken = signAccessToken({ id: user._id.toString(), role: user.role });
    const refreshToken = signRefreshToken({ id: user._id.toString(), tokenVersion: user.tokenVersion });

    // Create response
    const response = NextResponse.json({
      success: true,
      data: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });

    // Set cookies
    setAuthCookies(response, accessToken, refreshToken);

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

    console.error('Login error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

