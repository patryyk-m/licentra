import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getMemberRateLimit } from '@/lib/ratelimit';
import App from '@/models/App';
import User from '@/models/User';
import PartnerCredit from '@/models/PartnerCredit';
import { hasAppAccess } from '@/lib/authz';
import { sanitizeObjectId } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { fail, parseJson, wrapRoute } from '@/lib/http';

export const POST = wrapRoute(async function POST(req, { params }) {
  const rateLimited = checkRateLimit(req, getMemberRateLimit('remove'));
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

    const body = await parseJson(req, {});
    const rawMemberId = body?.memberId;
    const memberId = rawMemberId ? sanitizeObjectId(String(rawMemberId)) : null;
    const membershipType = body?.role?.toLowerCase() === 'partner' ? 'partner'
      : body?.role?.toLowerCase() === 'collaborator' || body?.role?.toLowerCase() === 'developer'
        ? 'collaborator'
        : null;

    if (!memberId || !membershipType) {
      return fail('memberId and valid role are required', 400);
    }

    await connectDB();
    const app = await App.findById(appId);
    if (!app) {
      return fail('app not found', 404);
    }

    const hasAccess = hasAppAccess(app, user);
    if (!hasAccess) {
      return fail('Forbidden', 403);
    }

    if (membershipType === 'collaborator' && app.ownerId?.toString() === memberId) {
      return fail('cannot remove the app owner', 400);
    }

    const canManage = user.role === 'admin' || app.ownerId?.toString() === user.id;

    if (!canManage) {
      return fail('Forbidden', 403);
    }

    if (membershipType === 'partner') {
      const member = await User.findOne({
        _id: memberId,
        role: 'partner',
      });
      if (!member) {
        return fail('partner not found', 404);
      }

      const hasAccess =
        Array.isArray(member.partnerApps) &&
        member.partnerApps.some((appRef) => appRef?.toString() === app._id.toString());

      if (!hasAccess) {
        return fail('partner is not assigned to this app', 400);
      }

      await User.updateOne(
        { _id: memberId },
        {
          $pull: {
            partnerApps: app._id,
          },
        }
      );
      await PartnerCredit.deleteOne({ appId: app._id, userId: memberId });

      return NextResponse.json({ success: true, message: 'partner removed from app' });
    }

    const member = await User.findOne({
      _id: memberId,
      role: { $in: ['developer', 'admin'] },
    });
    if (!member) {
      return fail('developer not found', 404);
    }

    const hasDeveloperAccess = (member.developerApps || []).some(
      (appRef) => appRef?.toString() === app._id.toString()
    );

    if (!hasDeveloperAccess) {
      return fail('developer is not assigned to this app', 400);
    }

    await User.updateOne(
      { _id: memberId },
      { $pull: { developerApps: app._id } }
    );

  return NextResponse.json({ success: true, message: 'collaborator removed from app' });
}, (error) => handleApiError(error, 'members_remove'));


