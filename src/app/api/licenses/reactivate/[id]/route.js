import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import License from '@/models/License';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getLicenseRateLimit } from '@/lib/ratelimit';
import { hasAppAccess, isAdmin } from '@/lib/authz';
import { sanitizeObjectId } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { requireStepUp } from '@/lib/auth-cookies';
import { SECURITY_EVENTS, logAdminAction } from '@/lib/security';
import { fail } from '@/lib/http';

export async function POST(req, { params }) {
  const rateLimited = checkRateLimit(req, getLicenseRateLimit('update'));
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return fail('Unauthorized', 401);
    }

    const { id } = await params;
    const licenseId = id ? sanitizeObjectId(id) : null;
    if (!licenseId) {
      return fail('invalid license id', 400);
    }

    await connectDB();
    const license = await License.findById(licenseId).populate('appId');
    if (!license) {
      return fail('license not found', 404);
    }

    const app = license.appId;
    const hasAccess = hasAppAccess(app, user);
    if (!hasAccess) {
      return fail('Forbidden', 403);
    }

    const isOwner = app.ownerId?.toString() === user.id;
    const admin = isAdmin(user);
    if (!admin && !isOwner) {
      return fail('only app owner or admin can reactivate licenses', 403);
    }

    const stepUpOk = await requireStepUp(req, user);
    if (!stepUpOk) {
      return fail('step-up required', 403);
    }

    await License.updateOne({ _id: licenseId }, { $set: { status: 'active' } });

    await logAdminAction({
      actorUserId: user.id,
      action: SECURITY_EVENTS.LICENSE_REACTIVATED,
      targetType: 'license',
      targetId: licenseId,
      metadata: { appId: app._id },
      req,
    });

    return NextResponse.json({
      success: true,
      message: 'license reactivated',
      data: { licenseId },
    });
  } catch (error) {
    return handleApiError(error, 'license_reactivate');
  }
}
