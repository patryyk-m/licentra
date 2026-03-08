import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getInviteRateLimit } from '@/lib/ratelimit';
import App from '@/models/App';
import AppInvite from '@/models/AppInvite';
import { hasAppAccess } from '@/lib/authz';
import { cleanupAppInvites } from '../_lib';
import { sanitizeObjectId } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { fail, wrapRoute } from '@/lib/http';

export const DELETE = wrapRoute(async function DELETE(req, { params }) {
  const rateLimited = checkRateLimit(req, getInviteRateLimit('delete'));
  if (rateLimited) return rateLimited;
  const user = await authenticateUser(req);
  if (!user) {
    return fail('Unauthorized', 401);
  }

    const resolvedParams = await params;
    const appId = resolvedParams?.id ? sanitizeObjectId(resolvedParams.id) : null;
    const inviteId = resolvedParams?.inviteId ? sanitizeObjectId(resolvedParams.inviteId) : null;

    if (!appId || !inviteId) {
      return fail('invalid request parameters', 400);
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

    const canManage = user.role === 'admin' || app.ownerId?.toString() === user.id;
    if (!canManage) {
      return fail('Forbidden', 403);
    }

    await cleanupAppInvites(app._id);

    const invite = await AppInvite.findById(inviteId);
    if (!invite || invite.appId?.toString() !== app._id.toString()) {
      return fail('invite not found', 404);
    }

    await AppInvite.deleteOne({ _id: invite._id });

  return NextResponse.json({
    success: true,
    message: 'invite cleared',
  });
}, (error) => handleApiError(error, 'invites_delete'));


