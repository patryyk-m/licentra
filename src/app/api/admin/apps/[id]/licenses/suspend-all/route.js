import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import License from '@/models/License';
import App from '@/models/App';
import { sanitizeObjectId } from '@/lib/security';
import { SECURITY_EVENTS, logAdminAction } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { withAdmin, withStepUp, parseJson, fail, wrapRoute } from '@/lib/http';

export const POST = wrapRoute(async function POST(req, { params }) {
    const requireAdmin = withAdmin(async (_req, actor) => ({ actor }), {
      forbiddenMessage: 'forbidden',
      forbiddenStatus: 403,
    });
    const guardResult = await requireAdmin(req);
    if (guardResult instanceof NextResponse) return guardResult;
    const { actor } = guardResult;

    const body = await parseJson(req, {});
    const confirm = body?.confirm || '';
    if (confirm !== 'SUSPEND_ALL') {
      return fail('confirmation string SUSPEND_ALL required', 400);
    }

    const requireStepUpForAdmin = withStepUp(async (_req, user) => ({ user }), {
      stepUpMessage: 'step-up required',
      stepUpStatus: 403,
    });
    const stepUpResult = await requireStepUpForAdmin(req, actor);
    if (stepUpResult instanceof NextResponse) return stepUpResult;

    const { id } = await params;
    const appId = id ? sanitizeObjectId(id) : null;
    if (!appId) {
      return fail('invalid app id', 400);
    }

    await connectDB();
    const app = await App.findById(appId);
    if (!app) {
      return fail('app not found', 404);
    }

    const result = await License.updateMany(
      { appId: app._id, status: 'active' },
      { $set: { status: 'suspended' } }
    );

    const count = result.modifiedCount || 0;

    await logAdminAction({
      actorUserId: actor.id,
      action: SECURITY_EVENTS.BULK_LICENSE_SUSPEND,
      targetType: 'app',
      targetId: app._id.toString(),
      metadata: { count },
      req,
    });

    return NextResponse.json({
      success: true,
      message: 'licenses suspended',
      data: { count },
    });
}, (error) => handleApiError(error, 'admin_bulk_suspend_licenses'));

