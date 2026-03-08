import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAppRateLimit } from '@/lib/ratelimit';
import { sanitizeObjectId } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { fail, wrapRoute } from '@/lib/http';

export const POST = wrapRoute(async function POST(req) {
  const rateLimited = checkRateLimit(req, getAppRateLimit('reorder'));
  if (rateLimited) return rateLimited;
  const user = await authenticateUser(req);
  if (!user) {
    return fail('Unauthorized', 401);
  }

  const allowedRoles = ['developer', 'admin', 'partner'];
  if (!allowedRoles.includes(user.role)) {
    return fail('Forbidden: insufficient permissions', 403);
  }

  await connectDB();
  const body = await req.json();
  const { order } = body || {};

  if (!Array.isArray(order)) {
    return fail('invalid order array', 400);
  }

  const sanitizedOrder = order
    .map((id) => (id != null ? sanitizeObjectId(String(id)) : null))
    .filter(Boolean);
  if (sanitizedOrder.length !== order.length) {
    return fail('invalid app ids in order', 400);
  }

  const apps = await App.find({ _id: { $in: sanitizedOrder } }).select('ownerId');

  if (apps.length !== sanitizedOrder.length) {
    return fail('one or more apps not found', 400);
  }

  if (user.role !== 'admin') {
    const developerAppSet = new Set(
      (user.developerApps || []).map((appId) => appId.toString())
    );
    const partnerAppSet = new Set(
      (user.partnerApps || []).map((appId) => appId.toString())
    );
    const unauthorized = apps.some((app) => {
      const isOwner = app.ownerId?.toString() === user.id;
      const idString = app._id.toString();
      const hasCollabAccess = developerAppSet.has(idString);
      const hasPartnerAccess = partnerAppSet.has(idString);
      return !isOwner && !hasCollabAccess && !hasPartnerAccess;
    });
    if (unauthorized) {
      return fail('you can only reorder apps you manage', 403);
    }
  }

  await Promise.all(
    sanitizedOrder.map((appId, index) =>
      App.findByIdAndUpdate(appId, { sortOrder: index })
    )
  );

  return NextResponse.json({ success: true, message: 'sort order updated' });
}, (error) => handleApiError(error, 'apps_reorder'));

