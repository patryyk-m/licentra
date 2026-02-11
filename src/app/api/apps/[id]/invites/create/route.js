import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getInviteRateLimit } from '@/config/ratelimits';
import App from '@/models/App';
import User from '@/models/User';
import AppInvite from '@/models/AppInvite';
import { getCollaboratorLimit, getPartnerLimit } from '@/lib/plans';
import { hasAppAccess } from '@/lib/authz';
import { cleanupAppInvites } from '@/lib/maintenance';
import { logAccessEvent, SECURITY_EVENTS } from '@/lib/security-logger';
import { sanitizeObjectId } from '@/lib/sanitize';
import { handleApiError } from '@/lib/errors';

const MAX_ATTEMPTS = 5;

function generateCode() {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

export async function POST(req, { params }) {
  const rateLimited = checkRateLimit(req, getInviteRateLimit('create'));
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

    const canManage = user.role === 'admin' || app.ownerId?.toString() === user.id;
    if (!canManage) {
      logAccessEvent(SECURITY_EVENTS.ACCESS_DENIED, user.id, `app:${app._id}:invites`, req, 'insufficient_permissions').catch(() => {});
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    await cleanupAppInvites(app._id);

    const body = await req.json().catch(() => ({}));
    const requestedRole = typeof body?.role === 'string' ? body.role.trim().toLowerCase() : 'partner';
    const targetRole = requestedRole === 'collaborator' || requestedRole === 'developer'
      ? 'collaborator'
      : 'partner';
    const expiresInDays = typeof body?.expiresInDays === 'number' ? body.expiresInDays : 30;
    const normalizedDays = Math.min(Math.max(expiresInDays, 1), 90);
    const expiresAt = new Date(Date.now() + normalizedDays * 24 * 60 * 60 * 1000);

    let code = '';
    let attempts = 0;
    while (attempts < MAX_ATTEMPTS) {
      attempts += 1;
      code = generateCode();
      const existing = await AppInvite.findOne({ code });
      if (!existing) break;
      code = '';
    }

    if (!code) {
      return NextResponse.json(
        { success: false, message: 'unable to generate invite code, try again' },
        { status: 500 }
      );
    }

    if (targetRole === 'collaborator') {
      const owner = await User.findById(app.ownerId).select('plan');
      const collaboratorLimit = getCollaboratorLimit(owner?.plan || 'free');

      if (collaboratorLimit >= 0) {
        const collaboratorCount = await User.countDocuments({
          role: 'developer',
          developerApps: app._id,
          _id: { $ne: app.ownerId },
        });

        if (collaboratorCount >= collaboratorLimit) {
          return NextResponse.json(
            {
              success: false,
              message: `developer invite limit reached for this plan (${collaboratorLimit})`,
            },
            { status: 403 }
          );
        }
      }
    }

    if (targetRole === 'partner') {
      const owner = await User.findById(app.ownerId).select('plan');
      const partnerLimit = getPartnerLimit(owner?.plan || 'free');

      if (partnerLimit >= 0) {
        const partnerCount = await User.countDocuments({
          role: 'partner',
          partnerApps: app._id,
        });

        if (partnerCount >= partnerLimit) {
          return NextResponse.json(
            {
              success: false,
              message: `partner invite limit reached for this plan (${partnerLimit})`,
            },
            { status: 403 }
          );
        }
      }
    }

    const invite = await AppInvite.create({
      code,
      appId: app._id,
      createdBy: user.id,
      expiresAt,
      targetRole,
    });

    return NextResponse.json({
      success: true,
      data: {
        invite: {
          id: invite._id.toString(),
          code: invite.code,
          status: invite.status,
          createdAt: invite.createdAt,
          expiresAt: invite.expiresAt,
          targetRole: invite.targetRole,
        },
      },
    });
  } catch (error) {
    return handleApiError(error, 'create_app_invite');
  }
}


