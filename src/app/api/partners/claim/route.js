import { NextResponse } from 'next/server';
import { authenticateUser } from '@/middleware/auth';
import { connectDB } from '@/lib/db';
import { checkRateLimit } from '@/lib/ratelimit';
import User from '@/models/User';
import AppInvite from '@/models/AppInvite';
import App from '@/models/App';
import { ROLE } from '@/lib/roles';
import { getPartnerLimit } from '@/lib/plans';

export async function POST(req) {
  const rateLimited = checkRateLimit(req, 20, 1);
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== ROLE.PARTNER) {
      return NextResponse.json({ success: false, message: 'Only partners can claim codes' }, { status: 403 });
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
      targetRole: 'partner',
    });

    if (!invite) {
      return NextResponse.json({ success: false, message: 'invalid or already used code' }, { status: 400 });
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      invite.status = 'expired';
      await invite.save();
      return NextResponse.json({ success: false, message: 'this code has expired' }, { status: 400 });
    }

    const app = await App.findById(invite.appId);
    if (!app || app.status === 'suspended') {
      return NextResponse.json({ success: false, message: 'app not found or inactive' }, { status: 404 });
    }

    if (app.ownerId?.toString() === user.id) {
      return NextResponse.json(
        { success: false, message: 'app owners cannot redeem their own partner codes' },
        { status: 400 }
      );
    }

    const owner = await User.findById(app.ownerId).select('plan');
    const partnerLimit = getPartnerLimit(owner?.plan || 'free');

    if (partnerLimit >= 0) {
      const partnerCount = await User.countDocuments({
        role: ROLE.PARTNER,
        partnerApps: app._id,
      });

      if (partnerCount >= partnerLimit) {
        return NextResponse.json(
          {
            success: false,
            message: `partner capacity reached for this plan (${partnerLimit})`,
          },
          { status: 403 }
        );
      }
    }

    const alreadyHasApp = Array.isArray(user.partnerApps)
      ? user.partnerApps.some((appRef) => appRef?.toString() === invite.appId.toString())
      : false;

    if (alreadyHasApp) {
      return NextResponse.json(
        { success: false, message: 'you already manage this application' },
        { status: 400 }
      );
    }

    await User.updateOne(
      { _id: user.id },
      {
        $addToSet: { partnerApps: invite.appId },
      }
    );

    invite.status = 'redeemed';
    invite.redeemedBy = user.id;
    invite.redeemedAt = new Date();
    await invite.save();

    const updatedUser = await User.findById(user.id).select('partnerApps');

    return NextResponse.json({
      success: true,
      message: 'code applied successfully',
      data: {
        appId: invite.appId.toString(),
        partnerApps: (updatedUser?.partnerApps || []).map((appRef) => appRef.toString()),
      },
    });
  } catch (error) {
    console.error('partner claim error:', error);
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}


