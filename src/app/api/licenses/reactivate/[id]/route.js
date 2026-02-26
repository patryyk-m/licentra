import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import License from '@/models/License';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getLicenseRateLimit } from '@/config/ratelimits';
import { hasAppAccess } from '@/lib/authz';
import { sanitizeObjectId } from '@/lib/sanitize';
import { handleApiError } from '@/lib/errors';

export async function POST(req, { params }) {
  const rateLimited = checkRateLimit(req, getLicenseRateLimit('update'));
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user || !['developer', 'admin'].includes(user.role)) {
      return NextResponse.json(
        { success: false, message: 'Forbidden: insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const licenseId = id ? sanitizeObjectId(id) : null;
    if (!licenseId) {
      return NextResponse.json({ success: false, message: 'invalid license id' }, { status: 400 });
    }

    await connectDB();
    const license = await License.findById(licenseId).populate('appId');
    if (!license) {
      return NextResponse.json({ success: false, message: 'license not found' }, { status: 404 });
    }

    const app = license.appId;
    const hasAccess = hasAppAccess(app, user);
    if (!hasAccess) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    await License.updateOne({ _id: licenseId }, { $set: { status: 'active' } });

    return NextResponse.json({
      success: true,
      message: 'license reactivated',
      data: { licenseId },
    });
  } catch (error) {
    return handleApiError(error, 'license_reactivate');
  }
}
