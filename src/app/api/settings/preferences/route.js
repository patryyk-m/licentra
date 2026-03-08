import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/lib/ratelimit';
import User from '@/models/User';
import { handleApiError } from '@/lib/security';
import { fail, ok, withAuth, wrapRoute } from '@/lib/http';

const preferencesSchema = z.object({
  notifications: z.object({
    loginAlerts: z.boolean().optional(),
    passwordChange: z.boolean().optional(),
    sessionRevoked: z.boolean().optional(),
  }).optional(),
}).strict();

const getHandler = withAuth(async (_req, user) => {
  await connectDB();
  const userDoc = await User.findById(user.id).select('preferences').lean();

  return ok({
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
}, { unauthorizedMessage: 'Unauthorized' });

const patchHandler = withAuth(async (req, user) => {
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

  return ok({
    success: true,
    message: 'preferences updated',
  });
}, { unauthorizedMessage: 'Unauthorized' });

export const GET = wrapRoute(async function GET(req) {
  const rateLimitResponse = checkRateLimit(req, getAuthRateLimit('me'));
  if (rateLimitResponse) return rateLimitResponse;

  return await getHandler(req);
}, (error) => handleApiError(error, 'get_preferences'));

export async function PATCH(req) {
  const rateLimitResponse = checkRateLimit(req, { limit: 10, windowMinutes: 1 });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    return await patchHandler(req);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.errors[0].message, 400);
    }
    return handleApiError(error, 'update_preferences');
  }
}


