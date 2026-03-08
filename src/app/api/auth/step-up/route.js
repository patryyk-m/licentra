import { z } from 'zod';
import { authenticateUser } from '@/middleware/auth';
import User from '@/models/User';
import { verifyPassword, signStepUpToken } from '@/lib/auth';
import { SECURITY_EVENTS, logSecurityEvent } from '@/lib/security';
import { parseJson, ok, fail } from '@/lib/http';

const STEP_UP_COOKIE = 'licentra_step_up';

const schema = z.object({
  password: z.string().min(1).max(256),
});

export async function POST(req) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return fail('Unauthorized', 401);
    }

    const body = await parseJson(req);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail('password is required', 400);
    }

    const userDoc = await User.findById(user.id).select('+passwordHash');
    if (!userDoc || !userDoc.passwordHash) {
      return fail('step-up not available for this account', 400);
    }

    const isValidPassword = await verifyPassword(parsed.data.password, userDoc.passwordHash);
    if (!isValidPassword) {
      await logSecurityEvent(SECURITY_EVENTS.STEP_UP_FAILURE, { userId: user.id });
      return fail('invalid password', 401);
    }

    const token = signStepUpToken({ sub: user.id });

    const res = ok({ success: true, message: 'step-up confirmed' });
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookies.set(STEP_UP_COOKIE, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
      ...(isProduction && process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }),
    });

    await logSecurityEvent(SECURITY_EVENTS.STEP_UP_SUCCESS, { userId: user.id });

    return res;
  } catch (error) {
    return fail('step-up failed', 500);
  }
}

