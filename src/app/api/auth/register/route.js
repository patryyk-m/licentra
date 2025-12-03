import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import User from '@/models/User';
import AppInvite from '@/models/AppInvite';
import { normalizeRole, ROLE } from '@/lib/roles';
import { hashPassword } from '@/lib/crypto';
import { signAccessToken, signRefreshToken } from '@/lib/jwt';
import { setAuthCookies } from '@/lib/cookies';
import { checkRateLimit } from '@/lib/ratelimit';

const registerSchema = z.object({
  username: z.string().min(3).max(30).toLowerCase(),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8),
  confirmPassword: z.string(),
  partnerCode: z
    .string()
    .max(64)
    .optional()
    .transform((val) => (typeof val === 'string' ? val.trim() : undefined))
    .transform((val) => (val === '' ? undefined : val)),
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

    let role = ROLE.DEVELOPER;
    let partnerApps = [];
    let developerApps = [];
    let inviteToRedeem = null;

    if (validatedData.partnerCode) {
      const code = validatedData.partnerCode.toUpperCase();
      inviteToRedeem = await AppInvite.findOne({ code, status: 'active' });

      if (!inviteToRedeem) {
        return NextResponse.json(
          {
            success: false,
            message: 'Invalid partner code',
          },
          { status: 400 }
        );
      }

      if (inviteToRedeem.expiresAt && inviteToRedeem.expiresAt < new Date()) {
        inviteToRedeem.status = 'expired';
        await inviteToRedeem.save();
        return NextResponse.json(
          {
            success: false,
            message: 'This partner code has expired',
          },
          { status: 400 }
        );
      }

      if (inviteToRedeem.targetRole !== 'partner') {
        return NextResponse.json(
          {
            success: false,
            message: 'Collaborator invites must be claimed after signup',
          },
          { status: 400 }
        );
      }

      role = ROLE.PARTNER;
      partnerApps = [inviteToRedeem.appId];
    }

    // Hash password
    const passwordHash = await hashPassword(validatedData.password);

    // Create user with default role and free plan
    const user = await User.create({
      username: validatedData.username,
      email: validatedData.email,
      passwordHash,
      role,
      plan: 'free',
      partnerApps,
      developerApps,
    });

    if (inviteToRedeem) {
      inviteToRedeem.status = 'redeemed';
      inviteToRedeem.redeemedBy = user._id;
      inviteToRedeem.redeemedAt = new Date();
      await inviteToRedeem.save();
    }

    const tokenSeed = await User.findByIdAndUpdate(
      user._id,
      { $inc: { tokenVersion: 1 } },
      { new: true, select: 'tokenVersion' }
    );
    const rotatedTokenVersion = tokenSeed?.tokenVersion ?? (user.tokenVersion ?? 0) + 1;

    // Generate tokens
    const normalizedRole = normalizeRole(user.role);
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
        plan: user.plan,
        partnerApps: (user.partnerApps || []).map((appId) => appId.toString()),
        developerApps: user.developerApps.map((appId) => appId.toString()),
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

