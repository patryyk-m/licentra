import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAppRateLimit } from '@/config/ratelimits';
import { hasAppAccess } from '@/lib/authz';
import { sanitizeObjectId } from '@/lib/sanitize';
import { logAccessEvent, SECURITY_EVENTS } from '@/lib/security-logger';
import { handleApiError } from '@/lib/errors';

export async function DELETE(req, { params }) {
  const rateLimited = checkRateLimit(req, getAppRateLimit('delete'));
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const appId = id ? sanitizeObjectId(id) : null;
    if (!appId) {
      return NextResponse.json({ success: false, message: 'invalid app id' }, { status: 400 });
    }

    await connectDB();
    const app = await App.findById(appId);
    if (!app || app.status === 'suspended') {
      return NextResponse.json({ success: false, message: 'app not found' }, { status: 404 });
    }

    const hasAccess = hasAppAccess(app, user);
    if (!hasAccess) {
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `app:${app._id}`, req, 'no_app_access').catch(() => {});
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const isAdmin = user.role === 'admin';
    const isOwner = app.ownerId?.toString() === user.id;

    if (!isAdmin && !isOwner) {
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `app:${app._id}:delete`, req, 'insufficient_permissions').catch(() => {});
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    app.status = 'suspended';
    await app.save();

    return NextResponse.json({ success: true, message: 'Application suspended' });
  } catch (error) {
    return handleApiError(error, 'apps_delete');
  }
}


