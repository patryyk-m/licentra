import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getInviteRateLimit } from '@/config/ratelimits';
import App from '@/models/App';
import AppInvite from '@/models/AppInvite';
import { hasAppAccess } from '@/lib/authz';
import { cleanupAppInvites } from '@/lib/maintenance';

export async function DELETE(req, { params }) {
  const rateLimited = checkRateLimit(req, getInviteRateLimit('delete'));
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const appId = resolvedParams?.id;
    const inviteId = resolvedParams?.inviteId;

    if (!appId || !inviteId) {
      return NextResponse.json({ success: false, message: 'invalid request parameters' }, { status: 400 });
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

    const canManage = user.role === 'admin' || app.ownerId?.toString() === user.id;
    if (!canManage) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    await cleanupAppInvites(app._id);

    const invite = await AppInvite.findById(inviteId);
    if (!invite || invite.appId?.toString() !== app._id.toString()) {
      return NextResponse.json({ success: false, message: 'invite not found' }, { status: 404 });
    }

    await AppInvite.deleteOne({ _id: invite._id });

    return NextResponse.json({
      success: true,
      message: 'invite cleared',
    });
  } catch (error) {
    console.error('delete app invite error:', error);
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}


