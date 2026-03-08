import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import License from '@/models/License';
import AppInvite from '@/models/AppInvite';
import PartnerCredit from '@/models/PartnerCredit';
import ApiUsage from '@/models/ApiUsage';
import Notification from '@/models/Notification';
import RateLimitEvent from '@/models/RateLimitEvent';
import RateLimitAggregate from '@/models/RateLimitAggregate';
import AppRateLimitBucket from '@/models/AppRateLimitBucket';
import LicenseRateLimitBucket from '@/models/LicenseRateLimitBucket';
import User from '@/models/User';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAppRateLimit } from '@/lib/ratelimit';
import { hasAppAccess, isAdmin } from '@/lib/authz';
import { requireStepUp } from '@/lib/auth-cookies';
import { sanitizeObjectId } from '@/lib/security';
import { logAccessEvent, SECURITY_EVENTS, logAdminAction } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { fail, wrapRoute } from '@/lib/http';

export const DELETE = wrapRoute(async function DELETE(req, { params }) {
  const rateLimited = checkRateLimit(req, getAppRateLimit('delete'));
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
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `app:${app._id}`, req, 'no_app_access').catch(() => {});
      return fail('Forbidden', 403);
    }

    const isOwner = app.ownerId?.toString() === user.id;
    const admin = isAdmin(user);

    if (!admin && !isOwner) {
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `app:${app._id}:delete`, req, 'insufficient_permissions').catch(() => {});
      return fail('Forbidden', 403);
    }

    const stepUpOk = await requireStepUp(req, user);
    if (!stepUpOk) {
      return fail('step-up required', 403);
    }

    const appObjectId = app._id;
    const licenseIds = (await License.find({ appId: appObjectId }).select('_id').lean()).map((l) => l._id);

    await Promise.all([
      License.deleteMany({ appId: appObjectId }),
      AppInvite.deleteMany({ appId: appObjectId }),
      PartnerCredit.deleteMany({ appId: appObjectId }),
      ApiUsage.deleteMany({ appId: appObjectId }),
      Notification.deleteMany({ appId: appObjectId }),
      RateLimitEvent.deleteMany({ appId: appObjectId }),
      RateLimitAggregate.deleteMany({ appId: appObjectId }),
      AppRateLimitBucket.deleteMany({ appId: appObjectId }),
      licenseIds.length > 0
        ? LicenseRateLimitBucket.deleteMany({ licenseId: { $in: licenseIds } })
        : Promise.resolve(),
      User.updateMany(
        { $or: [{ developerApps: appObjectId }, { partnerApps: appObjectId }] },
        { $pull: { developerApps: appObjectId, partnerApps: appObjectId } }
      ),
      App.deleteOne({ _id: appObjectId }),
    ]);

    await logAdminAction({
      actorUserId: user.id,
      action: SECURITY_EVENTS.APP_DELETED,
      targetType: 'app',
      targetId: app._id.toString(),
      metadata: { deletedLicenses: licenseIds.length },
      req,
    });

  return NextResponse.json({ success: true, message: 'Application deleted' });
}, (error) => handleApiError(error, 'apps_delete'));


