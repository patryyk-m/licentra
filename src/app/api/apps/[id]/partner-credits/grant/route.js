import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import User from '@/models/User';
import PartnerCredit from '@/models/PartnerCredit';
import Notification from '@/models/Notification';
import { hasAppAccess } from '@/lib/authz';
import { sanitizeObjectId } from '@/lib/security';
import { logAdminAction, SECURITY_EVENTS } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { fail, wrapRoute } from '@/lib/http';

const schema = z.object({
  partnerUserId: z.string().min(1),
  credits: z.number().int().min(1).max(100000),
});

export const POST = wrapRoute(async function POST(req, { params }) {
  const user = await authenticateUser(req);
  if (!user) {
    return fail('Unauthorized', 401);
  }

    if (user.role === 'partner') {
      return fail('Forbidden', 403);
    }

    const { id } = await params;
    const appId = id ? sanitizeObjectId(id) : null;
    if (!appId) {
      return fail('invalid app id', 400);
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail('invalid input', 400);
    }

    const partnerUserId = sanitizeObjectId(parsed.data.partnerUserId);
    if (!partnerUserId) {
      return fail('invalid partner user id', 400);
    }

    await connectDB();
    const app = await App.findById(appId);
    if (!app) {
      return fail('app not found', 404);
    }

    if (!hasAppAccess(app, user)) {
      return fail('Forbidden', 403);
    }

    const partner = await User.findById(partnerUserId).select('role partnerApps').lean();
    if (!partner || partner.role !== 'partner') {
      return fail('partner not found', 404);
    }

    const assigned = Array.isArray(partner.partnerApps)
      ? partner.partnerApps.some((ref) => ref?.toString() === app._id.toString())
      : false;
    if (!assigned) {
      return fail('partner is not assigned to this app', 400);
    }

    const update = await PartnerCredit.findOneAndUpdate(
      { appId: app._id, userId: partnerUserId },
      { $inc: { balance: parsed.data.credits }, $set: { updatedBy: user.id } },
      { upsert: true, new: true }
    ).lean();

    const recipients = await User.find({
      $or: [{ _id: app.ownerId }, { developerApps: app._id }],
    })
      .select('_id')
      .lean();
    await Notification.insertMany(
      recipients.map((recipient) => ({
        userId: recipient._id,
        appId: app._id,
        type: 'info',
        title: 'partner credits granted',
        message: `${parsed.data.credits} credits granted to partner`,
        severity: 'info',
        metadata: {
          action: 'partner_credits_granted',
          partnerUserId,
          credits: parsed.data.credits,
          balance: update?.balance || 0,
        },
      })),
      { ordered: false }
    ).catch(() => {});

    await logAdminAction({
      actorUserId: user.id,
      action: SECURITY_EVENTS.PARTNER_CREDITS_GRANTED,
      targetType: 'app',
      targetId: app._id.toString(),
      metadata: {
        partnerUserId,
        creditsGranted: parsed.data.credits,
        currentBalance: update?.balance || 0,
      },
      req,
    });

  return NextResponse.json({
    success: true,
    message: 'credits granted',
    data: {
      partnerUserId,
      balance: update?.balance || 0,
    },
  });
}, (error) => handleApiError(error, 'partner_credits_grant'));

