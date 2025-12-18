import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import User from '@/models/User';
import { hashPassword } from '@/lib/crypto';
import { sendForgotPasswordEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAuthRateLimit } from '@/config/ratelimits';
import { handleApiError } from '@/lib/errors';
import crypto from 'crypto';

const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
}).strict();

export async function POST(req) {
  const rateLimitResponse = checkRateLimit(req, getAuthRateLimit('forgotPassword'));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    await connectDB();
    const body = await req.json();
    const validated = forgotPasswordSchema.parse(body);

    // find user by email
    const user = await User.findOne({ email: validated.email });
    
    // always return success to prevent email enumeration
    // but only send email if user exists
    if (user) {
      // generate secure random token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = await hashPassword(resetToken);
      
      // set token expiry (1 hour from now)
      const tokenExpiry = new Date();
      tokenExpiry.setHours(tokenExpiry.getHours() + 1);

      // save token hash and expiry to user
      await User.findByIdAndUpdate(user._id, {
        'passwordReset.token': tokenHash,
        'passwordReset.tokenExpiry': tokenExpiry,
      });

      // send email
      sendForgotPasswordEmail(user.email, resetToken).catch((error) => {
        console.error('[forgot_password] failed to send email:', error);
      });
    }

    return NextResponse.json({
      success: true,
      message: 'if an account exists with that email, a password reset link has been sent',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: error.errors[0].message },
        { status: 400 }
      );
    }
    return handleApiError(error, 'forgot_password');
  }
}

