import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import User from '@/models/User';
import AdminNote from '@/models/AdminNote';
import { sanitizeObjectId } from '@/lib/security';
import { SECURITY_EVENTS, logAdminAction } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { withAdmin, withStepUp, parseJson, wrapRoute } from '@/lib/http';

export const POST = wrapRoute(async function POST(req, { params }) {
    const body = await parseJson(req, {});
    const note = typeof body?.note === 'string' ? body.note.trim() : '';

    const requireAdminAndStepUp = withAdmin(
      withStepUp(async (_req, actor) => ({ actor }), { stepUpMessage: 'step-up required' }),
      { forbiddenMessage: 'forbidden', forbiddenStatus: 403 }
    );
    const guardResult = await requireAdminAndStepUp(req);
    if (guardResult instanceof NextResponse) return guardResult;
    const { actor } = guardResult;

    const { id } = await params;
    const userId = id ? sanitizeObjectId(id) : null;
    if (!userId) {
      return NextResponse.json({ success: false, message: 'invalid user id' }, { status: 400 });
    }

    await connectDB();
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ success: false, message: 'user not found' }, { status: 404 });
    }

    user.status = 'active';
    await user.save();

    if (note) {
      await AdminNote.create({
        targetType: 'user',
        targetId: user._id,
        note,
        visibility: 'user_visible',
        createdBy: actor.id,
      });
    }

    await logAdminAction({
      actorUserId: actor.id,
      action: SECURITY_EVENTS.USER_UNSUSPENDED,
      targetType: 'user',
      targetId: userId,
      metadata: note ? { note } : {},
      req,
    });

    return NextResponse.json({ success: true, message: 'user unsuspended' });
}, (error) => handleApiError(error, 'admin_user_unsuspend'));

