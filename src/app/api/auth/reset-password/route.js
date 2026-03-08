import { z } from 'zod';
import { connectDB } from '@/lib/db';
import User from '@/models/User';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { sendPasswordResetConfirmationEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/lib/ratelimit';
import { handleApiError } from '@/lib/security';
import { parseJson, ok, fail } from '@/lib/http';

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
}).strict();

export async function POST(req) {
  const rateLimitResponse = checkRateLimit(req, getAuthRateLimit('resetPassword'));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    await connectDB();
    const body = await parseJson(req);
    const validated = resetPasswordSchema.parse(body);

    // find user with matching reset token
    // we need to check all users and verify the token hash
    const users = await User.find({
      'passwordReset.token': { $ne: null },
      'passwordReset.tokenExpiry': { $gt: new Date() },
    }).select('+passwordReset.token');

    let user = null;
    for (const u of users) {
      if (u.passwordReset?.token) {
        const isValidToken = await verifyPassword(validated.token, u.passwordReset.token);
        if (isValidToken) {
          user = u;
          break;
        }
      }
    }

    if (!user) {
      return fail('invalid or expired reset token', 400);
    }

    // hash new password
    const newPasswordHash = await hashPassword(validated.newPassword);

    // update password, invalidate reset token, and increment token version
    await User.findByIdAndUpdate(user._id, {
      passwordHash: newPasswordHash,
      'passwordReset.token': null,
      'passwordReset.tokenExpiry': null,
      $inc: { tokenVersion: 1 }, // invalidate all sessions
    });

    // send confirmation email
    sendPasswordResetConfirmationEmail(user.email).catch((error) => {
      console.error('[reset_password] failed to send confirmation email:', error);
    });

    return ok({
      success: true,
      message: 'password has been reset successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.errors[0].message, 400);
    }
    return handleApiError(error, 'reset_password');
  }
}

