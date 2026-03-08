import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import License from '@/models/License';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getLicenseRateLimit } from '@/lib/ratelimit';
import { hasAppAccess } from '@/lib/authz';
import { requireStepUp } from '@/lib/auth-cookies';
import { sanitizeObjectId } from '@/lib/security';
import { logAccessEvent, SECURITY_EVENTS } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { fail, wrapRoute } from '@/lib/http';

export const GET = wrapRoute(async function GET(req) {
  const rateLimited = checkRateLimit(req, getLicenseRateLimit('export'));
  if (rateLimited) return rateLimited;
  const user = await authenticateUser(req);
  if (!user || !['developer', 'admin'].includes(user.role)) {
    return fail('Forbidden: insufficient permissions', 403);
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

    const hasAccess = hasAppAccess(app, user);
    if (!hasAccess) {
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `app:${app._id}:export`, req, 'no_app_access').catch(() => {});
      return fail('Forbidden', 403);
    }

    const isAdmin = user.role === 'admin';
    const isOwner = app.ownerId?.toString() === user.id;
    const isCollaborator = Array.isArray(user.developerApps)
      ? user.developerApps.some((appRef) => appRef?.toString() === app._id.toString())
      : false;

    if (!isAdmin && !isOwner && !isCollaborator) {
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `app:${app._id}:export`, req, 'insufficient_permissions').catch(() => {});
      return fail('Forbidden', 403);
    }

    const stepUpOk = await requireStepUp(req, user);
    if (!stepUpOk) {
      return fail('step-up required', 403);
    }

    const licenses = await License.find({ appId, status: 'active' }).sort({ createdAt: -1 }).lean();

    const csvRows = ['License Key,Status,Created,Expiry,HWID Locked,HWID Limit,HWIDs,Note'];
    for (const l of licenses) {
      const key = l.key || '';
      const created = l.createdAt ? new Date(l.createdAt).toISOString().split('T')[0] : '';
      const expiry = l.expiryDate ? new Date(l.expiryDate).toISOString().split('T')[0] : '';
      const hwidLocked = l.hwidLocked ? 'Yes' : 'No';
      const hwidLimit = l.hwidLocked ? (l.hwidLimit ?? 1) : '';
      const hwids = (l.hwids || []).join(';');
      const note = (l.note || '').replace(/,/g, ';');
      csvRows.push(`${key},${l.status},${created},${expiry},${hwidLocked},${hwidLimit},${hwids},${note}`);
    }

    const csv = csvRows.join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="licenses-${appId}-${Date.now()}.csv"`,
    },
  });
}, (error) => handleApiError(error, 'licenses_export'));


