import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getInviteRateLimit } from '@/config/ratelimits';
import App from '@/models/App';
import User from '@/models/User';
import AppInvite from '@/models/AppInvite';
import { hasAppAccess } from '@/lib/authz';
import { cleanupAppInvites } from '@/lib/maintenance';
import { sanitizeObjectId } from '@/lib/sanitize';
import { handleApiError } from '@/lib/errors';

export async function GET(req, { params }) {
  const rateLimited = checkRateLimit(req, getInviteRateLimit('list'));
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
    const app = await App.findById(appId).lean();
    if (!app || app.status === 'suspended') {
      return NextResponse.json({ success: false, message: 'app not found' }, { status: 404 });
    }

    const hasAccess = hasAppAccess(app, user);
    if (!hasAccess) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const canManage = user.role === 'admin' || app.ownerId?.toString() === user.id;
    if (!canManage) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    await cleanupAppInvites(app._id);

    const [partners, collaborators, invites] = await Promise.all([
      User.find({
        role: 'partner',
        partnerApps: app._id,
      })
        .select('username email createdAt updatedAt')
        .lean(),
      User.find({
        role: 'developer',
        developerApps: app._id,
      })
        .select('username email createdAt updatedAt')
        .lean(),
      AppInvite.find({ appId: app._id }).sort({ createdAt: -1 }).lean(),
    ]);

    const now = new Date();
    const expiredIds = [];
    invites.forEach((invite) => {
      if (invite.status === 'active' && invite.expiresAt && invite.expiresAt < now) {
        expiredIds.push(invite._id);
        invite.status = 'expired';
      }
    });

    if (expiredIds.length > 0) {
      await AppInvite.updateMany(
        { _id: { $in: expiredIds } },
        { status: 'expired' }
      );
    }

    const joinDateMap = new Map();
    invites.forEach((invite) => {
      if (invite.redeemedBy) {
        joinDateMap.set(invite.redeemedBy.toString(), invite.redeemedAt || invite.updatedAt || invite.createdAt);
      }
    });

    const partnerPayload = partners.map((partner) => ({
      id: partner._id.toString(),
      username: partner.username,
      email: partner.email,
      joinedAt: joinDateMap.get(partner._id.toString()) || partner.createdAt,
    }));

    const invitePayload = invites.map((invite) => {
      const normalizedRole =
        invite.targetRole === 'developer' || invite.targetRole === 'collaborator'
          ? 'collaborator'
          : 'partner';

      return {
        id: invite._id.toString(),
        code: invite.code,
        status: invite.status,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        redeemedAt: invite.redeemedAt,
        redeemedBy: invite.redeemedBy ? invite.redeemedBy.toString() : null,
        targetRole: normalizedRole,
      };
    });

    const collaboratorPayload = collaborators.map((dev) => ({
      id: dev._id.toString(),
      username: dev.username,
      email: dev.email,
      joinedAt: dev.updatedAt || dev.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: {
        app: {
          id: app._id.toString(),
          name: app.name,
        },
        partners: partnerPayload,
        collaborators: collaboratorPayload,
        invites: invitePayload,
      },
    });
  } catch (error) {
    return handleApiError(error, 'invites_list');
  }
}


