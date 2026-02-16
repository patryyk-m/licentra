import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/config/ratelimits';
import User from '@/models/User';
import { handleApiError } from '@/lib/errors';

const preferencesSchema = z.object({
  notifications: z.object({
    loginAlerts: z.boolean().optional(),
    passwordChange: z.boolean().optional(),
    sessionRevoked: z.boolean().optional(),
  }).optional(),
}).strict();

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
    const userDoc = await User.findById(user.id).select('preferences').lean();

    return NextResponse.json({
      success: true,
      data: {
        preferences: userDoc?.preferences || {
          notifications: {
            loginAlerts: true,
            passwordChange: true,
            sessionRevoked: true,
          },
        },
      },
    });
  } catch (error) {
    return handleApiError(error, 'get_preferences');
  }
}

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
    const validated = preferencesSchema.parse(body);

    // update preferences
    const updateData = {};
    if (validated.notifications) {
      updateData['preferences.notifications'] = validated.notifications;
    }

    await User.findByIdAndUpdate(user.id, {
      $set: updateData,
    });

    return NextResponse.json({
      success: true,
      message: 'preferences updated',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: error.errors[0].message },
        { status: 400 }
      );
    }
    return handleApiError(error, 'update_preferences');
  }
}


