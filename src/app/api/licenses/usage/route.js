import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { getLicenseRateLimit } from '@/config/ratelimits';
import ApiUsage from '@/models/ApiUsage';
import License from '@/models/License';
import App from '@/models/App';
import { sanitizeObjectId } from '@/lib/sanitize';
import { hasAppAccess } from '@/lib/authz';
import { handleApiError } from '@/lib/errors';

export async function GET(req) {
  const rateLimitResponse = checkRateLimit(req, getLicenseRateLimit('list'));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const rawAppId = searchParams.get('appId');
    const appId = rawAppId ? sanitizeObjectId(rawAppId) : null;

    if (!appId) {
      return NextResponse.json({ success: false, message: 'appId required' }, { status: 400 });
    }

    const app = await App.findById(appId);
    if (!app || app.status === 'suspended') {
      return NextResponse.json({ success: false, message: 'app not found' }, { status: 404 });
    }

    if (!hasAppAccess(app, user)) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
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
