import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAppRateLimit } from '@/lib/ratelimit';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { hasAppAccess, isAdmin } from '@/lib/authz';
import { sanitizeObjectId } from '@/lib/security';
import { logAccessEvent, logSecurityEvent, SECURITY_EVENTS, logAdminAction } from '@/lib/security';
import { requireStepUp } from '@/lib/auth-cookies';
import { handleApiError } from '@/lib/security';
import { fail, wrapRoute } from '@/lib/http';

export const POST = wrapRoute(async function POST(req, { params }) {
  const rateLimited = checkRateLimit(req, getAppRateLimit('resetSecret'));
  if (rateLimited) return rateLimited;
  const user = await authenticateUser(req);
  if (!user) {
    return fail('Unauthorized', 401);
  }

    const { id } = await params;
    const appId = id ? sanitizeObjectId(id) : null;
    if (!appId) {
      return fail('invalid app id', 400);
    }

    await connectDB();
    const app = await App.findById(appId);
    if (!app) {
      return fail('app not found', 404);
    }

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (
      app.status === 'suspended' &&
      (app.suspensionReason === 'plan_quota' || app.quotaSuspended) &&
      app.quotaSuspendedMonth !== monthKey
    ) {
      app.status = 'active';
      app.quotaSuspended = false;
      app.quotaSuspendedMonth = null;
      app.suspensionReason = 'none';
      await app.save();
    }

    const hasAccess = hasAppAccess(app, user);
    if (!hasAccess) {
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `app:${app._id}:reset-secret`, req, 'no_app_access').catch(() => {});
      return fail('Forbidden', 403);
    }

    const isOwner = app.ownerId?.toString() === user.id;
    const admin = isAdmin(user);

    if (!admin && !isOwner) {
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `app:${app._id}:reset-secret`, req, 'insufficient_permissions').catch(() => {});
      return fail('Forbidden', 403);
    }

    const stepUpOk = await requireStepUp(req, user);
    if (!stepUpOk) {
      return fail('step-up required', 403);
    }

    const plainSecret = crypto.randomBytes(48).toString('base64url');
    const apiSecretHash = await bcrypt.hash(plainSecret, 10);

    app.apiSecretHash = apiSecretHash;
    await app.save();

    await logAdminAction({
      actorUserId: user.id,
      action: SECURITY_EVENTS.API_SECRET_RESET,
      targetType: 'app',
      targetId: app._id.toString(),
      metadata: {},
      req,
    });

  return NextResponse.json({
    success: true,
    message: 'API secret reset',
    data: { apiSecret: plainSecret }, // return only once
  });
}, (error) => handleApiError(error, 'apps_reset_secret'));


