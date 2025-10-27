import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import User from '@/models/User';
import { hashPassword } from '@/lib/crypto';
import { signAccessToken, signRefreshToken } from '@/lib/jwt';
import { setAuthCookies } from '@/lib/cookies';
import { checkRateLimit } from '@/lib/ratelimit';

const registerSchema = z.object({
  accountType: z.enum(['developer', 'redistributor']),
  username: z.string().min(3).max(30).toLowerCase(),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export async function POST(req) {
  try {
    // Check rate limit
    const rateLimitResponse = checkRateLimit(req, 10, 1);
    if (rateLimitResponse) return rateLimitResponse;

    await connectDB();
    const body = await req.json();

    // Validate input
    const validatedData = registerSchema.parse(body);

    // Check if email or username already exists
    const existingUser = await User.findOne({
      $or: [
        { email: validatedData.email },
        { username: validatedData.username },
      ],
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          message: 'Username or email already exists',
        },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(validatedData.password);

    // Create user (admin will be set in db)
    const user = await User.create({
      username: validatedData.username,
      email: validatedData.email,
      passwordHash,
      role: validatedData.accountType, // developer or redistributor only
    });

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

    console.error('Registration error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

