import { NextResponse } from 'next/server';
import { authenticateUser } from '@/middleware/auth';
import { connectDB } from '@/lib/db';
import { checkRateLimit } from '@/lib/ratelimit';
import { getCollaboratorRateLimit } from '@/config/ratelimits';
import User from '@/models/User';
import App from '@/models/App';
import AppInvite from '@/models/AppInvite';
import { getCollaboratorLimit } from '@/lib/plans';
import { handleApiError } from '@/lib/errors';

export async function POST(req) {
  const rateLimited = checkRateLimit(req, getCollaboratorRateLimit('claim'));
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'developer' && user.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Only developers can claim these codes' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const codeInput = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';

    if (!codeInput) {
      return NextResponse.json({ success: false, message: 'code is required' }, { status: 400 });
    }

    await connectDB();
    const invite = await AppInvite.findOne({
      code: codeInput,
      status: 'active',
      targetRole: 'collaborator',
    });

    if (!invite) {
      return NextResponse.json({ success: false, message: 'invalid or already used code' }, { status: 400 });
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      invite.status = 'expired';
      await invite.save();
      return NextResponse.json({ success: false, message: 'this code has expired' }, { status: 400 });
    }

    const developerAppIds = Array.isArray(user.developerApps) ? user.developerApps : [];
    const alreadyHasAccess = developerAppIds.some((appRef) => appRef?.toString() === invite.appId.toString());

    if (alreadyHasAccess) {
      return NextResponse.json(
        { success: false, message: 'you already have full access to this application' },
        { status: 400 }
      );
    }

    const app = await App.findById(invite.appId);
    if (!app || app.status === 'suspended') {
      return NextResponse.json({ success: false, message: 'app not found or inactive' }, { status: 404 });
    }

    if (app.ownerId?.toString() === user.id) {
      return NextResponse.json(
        { success: false, message: 'app owners cannot redeem their own collaborator codes' },
        { status: 400 }
      );
    }

    const owner = await User.findById(app.ownerId).select('plan');
    const collaboratorLimit = getCollaboratorLimit(owner?.plan || 'free');

    if (collaboratorLimit >= 0) {
      const collaboratorCount = await User.countDocuments({
        role: 'developer',
        developerApps: invite.appId,
        _id: { $ne: app.ownerId },
      });

      if (collaboratorCount >= collaboratorLimit) {
        return NextResponse.json(
          { success: false, message: 'developer collaborator limit reached for this plan' },
          { status: 403 }
        );
      }
    }

    await User.updateOne(
      { _id: user.id },
      { $addToSet: { developerApps: invite.appId } }
    );

    invite.status = 'redeemed';
    invite.redeemedBy = user.id;
    invite.redeemedAt = new Date();
    await invite.save();

    const updatedUser = await User.findById(user.id).select('developerApps');

    return NextResponse.json({
      success: true,
      message: 'developer access granted',
      data: {
        appId: invite.appId.toString(),
        developerApps: (updatedUser?.developerApps || []).map((appRef) => appRef.toString()),
      },
    });
  } catch (error) {
    return handleApiError(error, 'collaborators_claim');
  }
}


