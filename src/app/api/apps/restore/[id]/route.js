import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAppRateLimit } from '@/lib/ratelimit';
import { hasAppAccess, isAdmin } from '@/lib/authz';
import { requireStepUp } from '@/lib/auth-cookies';
import { sanitizeObjectId } from '@/lib/security';
import { logAccessEvent, SECURITY_EVENTS, logAdminAction } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { fail, wrapRoute } from '@/lib/http';

export const POST = wrapRoute(async function POST(req, { params }) {
  const rateLimited = checkRateLimit(req, getAppRateLimit('restore'));
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

    const hasAccess = hasAppAccess(app, user);
    if (!hasAccess) {
      logAccessEvent(
        SECURITY_EVENTS.ACCESS_DENIED,
        user.id,
        `app:${app._id}:restore`,
        req,
        'no_app_access'
      ).catch(() => {});
      return fail('Forbidden', 403);
    }

    const ownerMatch = app.ownerId?.toString() === user.id;
    const admin = isAdmin(user);
    if (!admin && !ownerMatch) {
      logAccessEvent(
        SECURITY_EVENTS.ACCESS_DENIED,
        user.id,
        `app:${app._id}:restore`,
        req,
        'insufficient_permissions'
      ).catch(() => {});
      return fail('Forbidden', 403);
    }

    const stepUpOk = await requireStepUp(req, user);
    if (!stepUpOk) {
      return fail('step-up required', 403);
    }

    app.status = 'active';
    app.quotaSuspended = false;
    app.quotaSuspendedMonth = null;
    app.suspensionReason = 'none';
    await app.save();

    await logAdminAction({
      actorUserId: user.id,
      action: SECURITY_EVENTS.APP_RESTORED,
      targetType: 'app',
      targetId: app._id.toString(),
      metadata: {},
      req,
    });

  return NextResponse.json({ success: true, message: 'Application restored' });
}, (error) => handleApiError(error, 'apps_restore'));

