import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAppRateLimit } from '@/config/ratelimits';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { hasAppAccess } from '@/lib/authz';
import { sanitizeObjectId } from '@/lib/sanitize';
import { logAccessEvent, logSecurityEvent, SECURITY_EVENTS } from '@/lib/security-logger';
import { handleApiError } from '@/lib/errors';

export async function POST(req, { params }) {
  const rateLimited = checkRateLimit(req, getAppRateLimit('resetSecret'));
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
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `app:${app._id}:reset-secret`, req, 'no_app_access').catch(() => {});
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const isAdmin = user.role === 'admin';
    const isOwner = app.ownerId?.toString() === user.id;
    const isCollaborator = Array.isArray(user.developerApps)
      ? user.developerApps.some((appRef) => appRef?.toString() === app._id.toString())
      : false;

    if (!isAdmin && !isOwner && !isCollaborator) {
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `app:${app._id}:reset-secret`, req, 'insufficient_permissions').catch(() => {});
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const plainSecret = crypto.randomBytes(48).toString('base64url');
    const apiSecretHash = await bcrypt.hash(plainSecret, 10);

    app.apiSecretHash = apiSecretHash;
    await app.save();

    logSecurityEvent(SECURITY_EVENTS.API_SECRET_RESET, {
      userId: user.id,
      appId: app._id.toString(),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'API secret reset',
      data: { apiSecret: plainSecret }, // return only once
    });
  } catch (error) {
    return handleApiError(error, 'apps_reset_secret');
  }
}


