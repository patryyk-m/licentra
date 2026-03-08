import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import App from '@/models/App';
import { sanitizeObjectId } from '@/lib/security';
import { SECURITY_EVENTS, logAdminAction } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { withAdmin, withStepUp, fail, wrapRoute } from '@/lib/http';

export const POST = wrapRoute(async function POST(req, { params }) {
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
    const appId = id ? sanitizeObjectId(id) : null;
    if (!appId) {
      return fail('invalid app id', 400);
    }

    await connectDB();
    const app = await App.findById(appId);
    if (!app) {
      return fail('app not found', 404);
    }

    app.status = 'active';
    app.quotaSuspended = false;
    app.quotaSuspendedMonth = null;
    app.suspensionReason = 'none';
    await app.save();

    await logAdminAction({
      actorUserId: actor.id,
      action: SECURITY_EVENTS.APP_RESTORED,
      targetType: 'app',
      targetId: app._id.toString(),
      metadata: {},
      req,
    });

    return NextResponse.json({ success: true, message: 'app restored' });
}, (error) => handleApiError(error, 'admin_apps_restore'));

