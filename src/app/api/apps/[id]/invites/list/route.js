import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getInviteRateLimit } from '@/lib/ratelimit';
import App from '@/models/App';
import User from '@/models/User';
import AppInvite from '@/models/AppInvite';
import PartnerCredit from '@/models/PartnerCredit';
import { hasAppAccess } from '@/lib/authz';
import { cleanupAppInvites } from '../_lib';
import { sanitizeObjectId } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { fail, wrapRoute } from '@/lib/http';

export const GET = wrapRoute(async function GET(req, { params }) {
  const rateLimited = checkRateLimit(req, getInviteRateLimit('list'));
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
    const app = await App.findById(appId).lean();
    if (!app) {
      return fail('app not found', 404);
    }

    const hasAccess = hasAppAccess(app, user);
    if (!hasAccess) {
      return fail('Forbidden', 403);
    }

    const canViewMembers = user.role !== 'partner';
    if (!canViewMembers) {
      return fail('Forbidden', 403);
    }

    await cleanupAppInvites(app._id);

    const [partners, collaborators, invites, partnerCredits] = await Promise.all([
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
      PartnerCredit.find({ appId: app._id }).select('userId balance').lean(),
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

    const partnerCreditsMap = new Map(
      partnerCredits.map((credit) => [credit.userId?.toString(), Number(credit.balance || 0)])
    );

    const partnerPayload = partners.map((partner) => ({
      id: partner._id.toString(),
      username: partner.username,
      email: partner.email,
      joinedAt: joinDateMap.get(partner._id.toString()) || partner.createdAt,
      credits: partnerCreditsMap.get(partner._id.toString()) || 0,
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
}, (error) => handleApiError(error, 'invites_list'));


