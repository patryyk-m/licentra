import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import License from '@/models/License';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getLicenseRateLimit } from '@/lib/ratelimit';
import { hasAppAccess, isAdmin } from '@/lib/authz';
import { sanitizeObjectId } from '@/lib/security';
import { logAccessEvent, SECURITY_EVENTS, logAdminAction } from '@/lib/security';
import { requireStepUp } from '@/lib/auth-cookies';
import { handleApiError } from '@/lib/security';
import { fail, wrapRoute } from '@/lib/http';

export const DELETE = wrapRoute(async function DELETE(req, { params }) {
  const rateLimited = checkRateLimit(req, getLicenseRateLimit('delete'));
  if (rateLimited) return rateLimited;
  const user = await authenticateUser(req);
  if (!user) {
    return fail('Unauthorized', 401);
  }

    const { id } = await params;
    const licenseId = id ? sanitizeObjectId(id) : null;
    if (!licenseId) {
      return fail('invalid license id', 400);
    }

    await connectDB();
    const license = await License.findById(licenseId).populate('appId');
    if (!license) {
      return fail('license not found', 404);
    }

    const app = license.appId;
    const hasAccess = hasAppAccess(app, user);
    if (!hasAccess) {
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `license:${license._id}`, req, 'no_app_access').catch(() => {});
      return fail('Forbidden', 403);
    }

    const isOwner = app.ownerId?.toString() === user.id;
    const admin = isAdmin(user);

    if (!admin && !isOwner) {
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `license:${license._id}:delete`, req, 'insufficient_permissions').catch(() => {});
      return fail('Forbidden', 403);
    }

    const stepUpOk = await requireStepUp(req, user);
    if (!stepUpOk) {
      return fail('step-up required', 403);
    }

    await License.deleteOne({ _id: licenseId });

    await logAdminAction({
      actorUserId: user.id,
      action: SECURITY_EVENTS.LICENSE_DELETED,
      targetType: 'license',
      targetId: licenseId,
      metadata: { appId: app._id },
      req,
    });

  return NextResponse.json({ success: true, message: 'license deleted' });
}, (error) => handleApiError(error, 'licenses_delete'));

