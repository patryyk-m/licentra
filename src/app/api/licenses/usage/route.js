import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getLicenseRateLimit } from '@/lib/ratelimit';
import ApiUsage from '@/models/ApiUsage';
import License from '@/models/License';
import App from '@/models/App';
import { sanitizeObjectId } from '@/lib/security';
import { hasAppAccess } from '@/lib/authz';
import { handleApiError } from '@/lib/security';
import { fail } from '@/lib/http';

export async function GET(req) {
  const rateLimitResponse = checkRateLimit(req, getLicenseRateLimit('list'));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return fail('Unauthorized', 401);
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const rawAppId = searchParams.get('appId');
    const appId = rawAppId ? sanitizeObjectId(rawAppId) : null;

    if (!appId) {
      return fail('appId required', 400);
    }

    const app = await App.findById(appId);
    if (!app) {
      return fail('app not found', 404);
    }

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (
      app.status === 'suspended' &&
      (app.suspensionReason === 'plan_quota' || app.quotaSuspended) &&
      app.quotaSuspendedMonth !== monthKey
    ) {
      app.status = 'active';
      app.quotaSuspended = false;
      app.quotaSuspendedMonth = null;
      app.suspensionReason = 'none';
      await app.save();
    }

    if (!hasAppAccess(app, user)) {
      return fail('Forbidden', 403);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    // get all licenses for this app
    const licenses = await License.find({ appId }).select('_id').lean();
    const licenseIds = licenses.map(l => l._id);

    if (licenseIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {},
      });
    }

    // get usage stats for all licenses
    const allUsageRecords = await ApiUsage.find({
      appId,
      licenseId: { $in: licenseIds },
    }).lean();

    // get todays usage
    const todayUsage = await ApiUsage.find({
      appId,
      licenseId: { $in: licenseIds },
      date: today,
    }).lean();

    // get this months usage
    const monthUsage = await ApiUsage.find({
      appId,
      licenseId: { $in: licenseIds },
      date: { $gte: firstDayOfMonth },
    }).lean();

    const usageStats = {};
    
    licenseIds.forEach(licenseId => {
      const licenseIdStr = licenseId.toString();
      
      const todayCount = todayUsage
        .filter(r => r.licenseId?.toString() === licenseIdStr)
        .reduce((sum, r) => sum + (r.count || 0), 0);
      
      const monthCount = monthUsage
        .filter(r => r.licenseId?.toString() === licenseIdStr)
        .reduce((sum, r) => sum + (r.count || 0), 0);
      
      const allTimeCount = allUsageRecords
        .filter(r => r.licenseId?.toString() === licenseIdStr)
        .reduce((sum, r) => sum + (r.count || 0), 0);
      
      usageStats[licenseIdStr] = {
        today: todayCount,
        thisMonth: monthCount,
        allTime: allTimeCount,
      };
    });

    return NextResponse.json({
      success: true,
      data: usageStats,
    });
  } catch (error) {
    return handleApiError(error, 'get_license_usage');
  }
}
