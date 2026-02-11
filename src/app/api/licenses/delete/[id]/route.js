import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import License from '@/models/License';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getLicenseRateLimit } from '@/config/ratelimits';
import { hasAppAccess } from '@/lib/authz';
import { sanitizeObjectId } from '@/lib/sanitize';
import { logAccessEvent, SECURITY_EVENTS } from '@/lib/security-logger';
import { handleApiError } from '@/lib/errors';

export async function DELETE(req, { params }) {
  const rateLimited = checkRateLimit(req, getLicenseRateLimit('delete'));
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const licenseId = id ? sanitizeObjectId(id) : null;
    if (!licenseId) {
      return NextResponse.json({ success: false, message: 'invalid license id' }, { status: 400 });
    }

    await connectDB();
    const license = await License.findById(licenseId).populate('appId');
    if (!license) {
      return NextResponse.json({ success: false, message: 'license not found' }, { status: 404 });
    }

    const app = license.appId;
    const hasAccess = hasAppAccess(app, user);
    if (!hasAccess) {
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `license:${license._id}`, req, 'no_app_access').catch(() => {});
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const isAdmin = user.role === 'admin';
    const isOwner = app.ownerId?.toString() === user.id;
    const isCollaborator = Array.isArray(user.developerApps)
      ? user.developerApps.some((appRef) => appRef?.toString() === app._id.toString())
      : false;

    if (!isAdmin && !isOwner && !isCollaborator) {
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `license:${license._id}:delete`, req, 'insufficient_permissions').catch(() => {});
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    await License.deleteOne({ _id: licenseId });

    return NextResponse.json({ success: true, message: 'license deleted' });
  } catch (error) {
    return handleApiError(error, 'licenses_delete');
  }
}

