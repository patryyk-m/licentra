import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import License from '@/models/License';
import App from '@/models/App';
import ApiUsage from '@/models/ApiUsage';
import Notification from '@/models/Notification';
import User from '@/models/User';
import { checkRateLimit } from '@/lib/ratelimit';
import { getLicenseRateLimit } from '@/lib/ratelimit';
import { ROLE } from '@/lib/authz';
import { hasAppAccess } from '@/lib/authz';
import { sanitizeObjectId } from '@/lib/security';
import { logAccessEvent, SECURITY_EVENTS } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { fail, wrapRoute } from '@/lib/http';

export const GET = wrapRoute(async function GET(req) {
  const rateLimited = checkRateLimit(req, getLicenseRateLimit('list'));
  if (rateLimited) return rateLimited;
  const user = await authenticateUser(req);
  if (!user) {
    return fail('Unauthorized', 401);
  }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const rawAppId = searchParams.get('appId');
    const appId = rawAppId ? sanitizeObjectId(rawAppId) : null;

    if (!appId) {
      return fail('appId required', 400);
    }

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

    const developerAppIds = Array.isArray(user.developerApps) ? user.developerApps : [];
    const partnerAppIds = Array.isArray(user.partnerApps) ? user.partnerApps : [];
    const hasAccess = hasAppAccess(app, user);
    const isAdmin = user.role === ROLE.ADMIN;
    const isOwner = app.ownerId?.toString() === user.id;
    const isCollaborator = developerAppIds.some((appRef) => appRef?.toString() === app._id.toString());
    const isPartner = user.role === ROLE.PARTNER &&
      partnerAppIds.some((appRef) => appRef?.toString() === app._id.toString());

    if (!hasAccess) {
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `app:${app._id}:licenses`, req, 'no_app_access').catch(() => {});
      return fail('Forbidden', 403);
    }

    const licenseQuery = { appId: app._id };

    if (isPartner && !isAdmin && !isOwner && !isCollaborator) {
      licenseQuery.createdBy = user.id;
    }

    const licenses = await License.find(licenseQuery).sort({ createdAt: -1 }).lean();

    if (licenses.length === 0) {
      return NextResponse.json({ success: true, data: { licenses: [] } });
    }

    const creatorIds = [
      ...new Set(
        licenses
          .map((l) => l.createdBy?.toString?.())
          .filter(Boolean)
      ),
    ];
    const creators = creatorIds.length
      ? await User.find({ _id: { $in: creatorIds } }).select('username').lean()
      : [];
    const creatorMap = new Map(creators.map((u) => [u._id.toString(), u.username || '']));

    // get usage stats for all licenses
    const licenseIds = licenses.map(l => l._id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const todayUsage = await ApiUsage.find({
      appId: app._id,
      licenseId: { $in: licenseIds },
      date: today,
    }).lean();

    const monthUsage = await ApiUsage.find({
      appId: app._id,
      licenseId: { $in: licenseIds },
      date: { $gte: firstDayOfMonth },
    }).lean();

    const allUsage = await ApiUsage.find({
      appId: app._id,
      licenseId: { $in: licenseIds },
    }).lean();

    const licenseIdsWithAlerts = new Set(
      (await Notification.find({
        appId: app._id,
        licenseId: { $in: licenseIds },
        type: 'rate_limit',
        isRead: false,
      }).select('licenseId').lean())
        .map((n) => n.licenseId?.toString())
        .filter(Boolean)
    );

    const sanitized = licenses.map((l) => {
      const licenseId = l._id;
      const licenseIdStr = licenseId.toString();
      
      // match licenseId using both string and ObjectId comparison
      const todayCount = todayUsage
        .filter(r => {
          if (!r.licenseId) return false;
          const rLicenseIdStr = r.licenseId.toString ? r.licenseId.toString() : String(r.licenseId);
          return rLicenseIdStr === licenseIdStr;
        })
        .reduce((sum, r) => sum + (r.count || 0), 0);
      
      const monthCount = monthUsage
        .filter(r => {
          if (!r.licenseId) return false;
          const rLicenseIdStr = r.licenseId.toString ? r.licenseId.toString() : String(r.licenseId);
          return rLicenseIdStr === licenseIdStr;
        })
        .reduce((sum, r) => sum + (r.count || 0), 0);
      
      const allTimeCount = allUsage
        .filter(r => {
          if (!r.licenseId) return false;
          const rLicenseIdStr = r.licenseId.toString ? r.licenseId.toString() : String(r.licenseId);
          return rLicenseIdStr === licenseIdStr;
        })
        .reduce((sum, r) => sum + (r.count || 0), 0);

      const createdById = l.createdBy?.toString?.() || '';
      const createdByUsername = createdById ? creatorMap.get(createdById) || '' : '';

      return {
        id: l._id.toString(),
        key: l.key || '',
        note: l.note || '',
        hwids: Array.isArray(l.hwids) ? l.hwids : [],
        hwidLocked: l.hwidLocked === true,
        hwidLimit: l.hwidLimit ?? null,
        expiryDate: l.expiryDate || null,
        status: l.status,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        createdById,
        createdByUsername,
        isExpired: l.expiryDate ? new Date(l.expiryDate) < new Date() : false,
        hasRateLimitAlert: licenseIdsWithAlerts.has(licenseIdStr),
        usage: {
          today: todayCount,
          thisMonth: monthCount,
          allTime: allTimeCount,
        },
      };
    });

  return NextResponse.json({ success: true, data: { licenses: sanitized } });
}, (error) => handleApiError(error, 'licenses_list'));


