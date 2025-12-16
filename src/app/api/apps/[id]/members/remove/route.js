import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getMemberRateLimit } from '@/config/ratelimits';
import App from '@/models/App';
import User from '@/models/User';
import { hasAppAccess } from '@/lib/authz';

export async function POST(req, { params }) {
  const rateLimited = checkRateLimit(req, getMemberRateLimit('remove'));
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const appId = id;
    if (!appId) {
      return NextResponse.json({ success: false, message: 'invalid app id' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const memberId = body?.memberId;
    const membershipType = body?.role?.toLowerCase() === 'partner' ? 'partner'
      : body?.role?.toLowerCase() === 'collaborator' || body?.role?.toLowerCase() === 'developer'
        ? 'collaborator'
        : null;

    if (!memberId || !membershipType) {
      return NextResponse.json(
        { success: false, message: 'memberId and valid role are required' },
        { status: 400 }
      );
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

    if (membershipType === 'collaborator' && app.ownerId?.toString() === memberId) {
      return NextResponse.json({ success: false, message: 'cannot remove the app owner' }, { status: 400 });
    }

    const canManage = user.role === 'admin' || app.ownerId?.toString() === user.id;

    if (!canManage) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    if (membershipType === 'partner') {
      const member = await User.findOne({
        _id: memberId,
        role: 'partner',
      });
      if (!member) {
        return NextResponse.json({ success: false, message: 'partner not found' }, { status: 404 });
      }

      const hasAccess =
        Array.isArray(member.partnerApps) &&
        member.partnerApps.some((appRef) => appRef?.toString() === app._id.toString());

      if (!hasAccess) {
        return NextResponse.json(
          { success: false, message: 'partner is not assigned to this app' },
          { status: 400 }
        );
      }

      await User.updateOne(
        { _id: memberId },
        {
          $pull: {
            partnerApps: app._id,
          },
        }
      );

      return NextResponse.json({ success: true, message: 'partner removed from app' });
    }

    const member = await User.findOne({
      _id: memberId,
      role: { $in: ['developer', 'admin'] },
    });
    if (!member) {
      return NextResponse.json({ success: false, message: 'developer not found' }, { status: 404 });
    }

    const hasDeveloperAccess = (member.developerApps || []).some(
      (appRef) => appRef?.toString() === app._id.toString()
    );

    if (!hasDeveloperAccess) {
      return NextResponse.json(
        { success: false, message: 'developer is not assigned to this app' },
        { status: 400 }
      );
    }

    await User.updateOne(
      { _id: memberId },
      { $pull: { developerApps: app._id } }
    );

    return NextResponse.json({ success: true, message: 'collaborator removed from app' });
  } catch (error) {
    console.error('remove member error:', error);
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}


