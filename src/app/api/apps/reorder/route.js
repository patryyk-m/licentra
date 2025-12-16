import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAppRateLimit } from '@/config/ratelimits';

export async function POST(req) {
  const rateLimited = checkRateLimit(req, getAppRateLimit('reorder'));
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['developer', 'admin', 'partner'];
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, message: 'Forbidden: insufficient permissions' },
        { status: 403 }
      );
    }

    await connectDB();
    const body = await req.json();
    const { order } = body || {};

    if (!Array.isArray(order)) {
      return NextResponse.json({ success: false, message: 'invalid order array' }, { status: 400 });
    }

    const apps = await App.find({ _id: { $in: order } }).select('ownerId');

    if (apps.length !== order.length) {
      return NextResponse.json({ success: false, message: 'one or more apps not found' }, { status: 400 });
    }

    if (user.role !== 'admin') {
      const developerAppSet = new Set(
        (user.developerApps || []).map((appId) => appId.toString())
      );
      const partnerAppSet = new Set(
        (user.partnerApps || []).map((appId) => appId.toString())
      );
      const unauthorized = apps.some((app) => {
        const isOwner = app.ownerId?.toString() === user.id;
        const idString = app._id.toString();
        const hasCollabAccess = developerAppSet.has(idString);
        const hasPartnerAccess = partnerAppSet.has(idString);
        return !isOwner && !hasCollabAccess && !hasPartnerAccess;
      });
      if (unauthorized) {
        return NextResponse.json(
          { success: false, message: 'you can only reorder apps you manage' },
          { status: 403 }
        );
      }
    }

    await Promise.all(
      order.map((appId, index) =>
        App.findByIdAndUpdate(appId, { sortOrder: index })
      )
    );

    return NextResponse.json({ success: true, message: 'sort order updated' });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}

