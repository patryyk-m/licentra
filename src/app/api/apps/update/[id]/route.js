import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAppRateLimit } from '@/config/ratelimits';
import { hasAppAccess } from '@/lib/authz';
import { sanitizeObjectId, sanitizeForDb } from '@/lib/sanitize';
import { handleApiError } from '@/lib/errors';

export async function PATCH(req, { params }) {
  const rateLimited = checkRateLimit(req, getAppRateLimit('update'));
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
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const isAdmin = user.role === 'admin';
    const isOwner = app.ownerId?.toString() === user.id;
    const isCollaborator = Array.isArray(user.developerApps)
      ? user.developerApps.some((appRef) => appRef?.toString() === app._id.toString())
      : false;

    if (!isAdmin && !isOwner && !isCollaborator) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const updates = {};
    if (typeof body?.name === 'string') {
      const nm = sanitizeForDb(body.name.trim(), 40);
      if (!nm || nm.length < 2) {
        return NextResponse.json({ success: false, message: 'name must be between 2 and 40 characters' }, { status: 400 });
      }
      updates.name = nm;
    }
    if (typeof body?.description === 'string') {
      const desc = sanitizeForDb(body.description.trim(), 500);
      updates.description = desc ?? '';
    }
    if (typeof body?.validationsPerMinutePerLicense === 'number') {
      const v = Math.min(Math.max(Math.floor(body.validationsPerMinutePerLicense), 1), 120);
      updates.validationsPerMinutePerLicense = v;
    }
    if (typeof body?.autoSuspendOnRateLimitAbuse === 'boolean') {
      updates.autoSuspendOnRateLimitAbuse = body.autoSuspendOnRateLimitAbuse;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, message: 'no updates provided' }, { status: 400 });
    }

    Object.assign(app, updates);
    await app.save();

    return NextResponse.json({
      success: true,
      message: 'Application updated',
      data: {
        app: {
          id: app._id.toString(),
          name: app.name,
          description: app.description || '',
          status: app.status,
          validationsPerMinutePerLicense: app.validationsPerMinutePerLicense ?? 10,
          autoSuspendOnRateLimitAbuse: app.autoSuspendOnRateLimitAbuse ?? false,
          createdAt: app.createdAt,
          updatedAt: app.updatedAt,
        },
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, message: 'an app with this name already exists' },
        { status: 409 }
      );
    }
    return handleApiError(error, 'apps_update');
  }
}


