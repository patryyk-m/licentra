import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import License from '@/models/License';
import { sanitizeObjectId } from '@/lib/security';
import { SECURITY_EVENTS, logAdminAction } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { withAdmin, withStepUp, fail, wrapRoute } from '@/lib/http';

export const DELETE = wrapRoute(async function DELETE(req, { params }) {
    const requireAdminAndStepUp = withAdmin(
      withStepUp(async (_req, actor) => ({ actor }), {
        stepUpMessage: 'step-up required',
        stepUpStatus: 403,
      }),
      { forbiddenMessage: 'forbidden', forbiddenStatus: 403 }
    );
    const guardResult = await requireAdminAndStepUp(req);
    if (guardResult instanceof NextResponse) return guardResult;
    const { actor } = guardResult;

    const { id } = await params;
    const licenseId = id ? sanitizeObjectId(id) : null;
    if (!licenseId) {
      return fail('invalid license id', 400);
    }

    await connectDB();
    const license = await License.findById(licenseId);
    if (!license) {
      return fail('license not found', 404);
    }
    const appId = license.appId?.toString?.() || null;
    await License.deleteOne({ _id: licenseId });

    await logAdminAction({
      actorUserId: actor.id,
      action: SECURITY_EVENTS.LICENSE_DELETED,
      targetType: 'license',
      targetId: licenseId,
      metadata: { appId },
      req,
    });

    return NextResponse.json({ success: true, message: 'license deleted' });
}, (error) => handleApiError(error, 'admin_license_delete'));

