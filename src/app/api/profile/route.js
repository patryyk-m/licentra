import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/config/ratelimits';
import User from '@/models/User';
import { normalizeRole } from '@/lib/roles';
import { handleApiError } from '@/lib/errors';

const updateProfileSchema = z.object({
  username: z.string().min(3).max(30).toLowerCase().trim().optional(),
}).strict();

// get profile data
export async function GET(req) {
  const rateLimitResponse = checkRateLimit(req, getAuthRateLimit('me'));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    await connectDB();
    const userDoc = await User.findById(user.id).lean();

    if (!userDoc) {
      return NextResponse.json(
        { success: false, message: 'user not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        profile: {
          id: userDoc._id.toString(),
          username: userDoc.username,
          email: userDoc.email,
          role: normalizeRole(userDoc.role),
          plan: userDoc.plan || 'free',
          createdAt: userDoc.createdAt,
        },
      },
    });
  } catch (error) {
    return handleApiError(error, 'get_profile');
  }
}

// update profile (username only)
export async function PATCH(req) {
  const rateLimitResponse = checkRateLimit(req, { limit: 10, windowMinutes: 1 });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    await connectDB();
    const body = await req.json();
    const validated = updateProfileSchema.parse(body);

    // only allow username updates
    if (!validated.username) {
      return NextResponse.json(
        { success: false, message: 'no valid fields to update' },
        { status: 400 }
      );
    }

    // check if username already exists (excluding current user)
    const existingUser = await User.findOne({
      username: validated.username,
      _id: { $ne: user.id },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, message: 'username already taken' },
        { status: 409 }
      );
    }

    // update username
    await User.findByIdAndUpdate(user.id, {
      username: validated.username,
    });

    return NextResponse.json({
      success: true,
      message: 'profile updated',
      data: {
        profile: {
          username: validated.username,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: error.errors[0].message },
        { status: 400 }
      );
    }
    return handleApiError(error, 'update_profile');
  }
}


