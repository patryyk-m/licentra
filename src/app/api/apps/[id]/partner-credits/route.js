import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import PartnerCredit from '@/models/PartnerCredit';
import { hasAppAccess } from '@/lib/authz';
import { sanitizeObjectId } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { fail, wrapRoute } from '@/lib/http';

export const GET = wrapRoute(async function GET(req, { params }) {
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

    const access = hasAppAccess(app, user);
    if (!access) {
      return fail('Forbidden', 403);
    }

    const canManageCredits = user.role !== 'partner';
    const myCredit = await PartnerCredit.findOne({ appId, userId: user.id }).lean();

    if (!canManageCredits) {
      return NextResponse.json({
        success: true,
        data: {
          myCredits: myCredit?.balance || 0,
          canManageCredits: false,
          partners: [],
        },
      });
    }

    const credits = await PartnerCredit.find({ appId }).select('userId balance updatedAt').lean();
  return NextResponse.json({
    success: true,
    data: {
      myCredits: myCredit?.balance || 0,
      canManageCredits: true,
      partners: credits.map((c) => ({
        userId: c.userId?.toString(),
        credits: c.balance || 0,
        updatedAt: c.updatedAt,
      })),
    },
  });
}, (error) => handleApiError(error, 'partner_credits_get'));

