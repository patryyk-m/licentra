import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import PartnerCredit from '@/models/PartnerCredit';
import App from '@/models/App';
import { handleApiError } from '@/lib/security';
import { wrapRoute } from '@/lib/http';

export const GET = wrapRoute(async function GET(req) {
  const user = await authenticateUser(req);
  if (!user) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  if (user.role !== 'partner') {
    return NextResponse.json(
      { success: false, message: 'Forbidden' },
      { status: 403 }
    );
  }

  await connectDB();

  const credits = await PartnerCredit.find({ userId: user.id })
    .select('appId balance')
    .lean();

  const appIds = [...new Set(credits.map((c) => c.appId?.toString()).filter(Boolean))];
  const apps = appIds.length
    ? await App.find({ _id: { $in: appIds } }).select('name').lean()
    : [];
  const appNameMap = new Map(apps.map((a) => [a._id.toString(), a.name || 'app']));

  const totalCredits = credits.reduce((sum, c) => sum + (Number(c.balance) || 0), 0);

  return NextResponse.json({
    success: true,
    data: {
      totalCredits,
      apps: credits.map((c) => ({
        appId: c.appId?.toString(),
        appName: appNameMap.get(c.appId?.toString() || '') || 'app',
        credits: Number(c.balance) || 0,
      })),
    },
  });
}, (error) => handleApiError(error, 'dashboard_partner_credits'));

