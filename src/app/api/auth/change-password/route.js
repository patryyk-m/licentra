import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/lib/ratelimit';
import { verifyPassword, hashPassword } from '@/lib/auth';
import User from '@/models/User';
import SecurityLog from '@/models/SecurityLog';
import { logAuthEvent, SECURITY_EVENTS, getClientIp, getUserAgent } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { sendPasswordResetConfirmationEmail } from '@/lib/email';
import { parseJson, ok, fail } from '@/lib/http';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'current password is required'),
  newPassword: z.string().min(8, 'password must be at least 8 characters'),
});

export async function POST(req) {
  const rateLimitResponse = checkRateLimit(req, getAuthRateLimit('changePassword'));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return fail('Unauthorized', 401);
    }

    await connectDB();
    const body = await parseJson(req);
    const { currentPassword, newPassword } = changePasswordSchema.parse(body);

    // get full user with password hash
    const userDoc = await User.findById(user.id).select('+passwordHash');
    if (!userDoc) {
      return fail('user not found', 404);
    }

    // verify current password
    const isValidPassword = await verifyPassword(currentPassword, userDoc.passwordHash);
    if (!isValidPassword) {
      logAuthEvent(SECURITY_EVENTS.LOGIN_FAILURE, user.id, req, { reason: 'invalid_current_password', action: 'change_password' }).catch(() => {});
      return fail('current password is incorrect', 401);
    }

    // hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // update password and increment token version (invalidate all sessions)
    await User.findByIdAndUpdate(user.id, {
      passwordHash: newPasswordHash,
      $inc: { tokenVersion: 1 },
    });

    // log security event
    await SecurityLog.create({
      userId: user.id,
      event: 'password_changed',
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      details: { timestamp: new Date().toISOString() },
    });

    logAuthEvent(SECURITY_EVENTS.PASSWORD_CHANGED, user.id, req).catch(() => {});

    // send confirmation email
    sendPasswordResetConfirmationEmail(userDoc.email).catch((error) => {
      console.error('[change_password] failed to send confirmation email:', error);
    });

    return ok({
      success: true,
      message: 'password changed successfully. all sessions have been invalidated.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.errors[0].message, 400);
    }
    return handleApiError(error, 'change_password');
  }
}

