import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import AdminNote from '@/models/AdminNote';
import { sanitizeObjectId } from '@/lib/security';
import { SECURITY_EVENTS, logAdminAction } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { withAdmin, withStepUp, parseJson, fail, wrapRoute } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = wrapRoute(async function GET(req) {
    const requireAdmin = withAdmin(async () => ({ ok: true }), {
      forbiddenMessage: 'forbidden',
      forbiddenStatus: 403,
    });
    const guardResult = await requireAdmin(req);
    if (guardResult instanceof NextResponse) return guardResult;

    const url = new URL(req.url);
    const targetType = url.searchParams.get('targetType') || '';
    const targetIdRaw = url.searchParams.get('targetId') || '';

    if (!targetType || !targetIdRaw) {
      return fail('targetType and targetId are required', 400);
    }

    const targetId = sanitizeObjectId(targetIdRaw);
    if (!targetId) {
      return fail('invalid target id', 400);
    }

    await connectDB();
    const notes = await AdminNote.find({ targetType, targetId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: {
        notes: notes.map((n) => ({
          id: n._id.toString(),
          targetType: n.targetType,
          targetId: n.targetId.toString(),
          note: n.note,
          visibility: n.visibility || 'internal',
          createdBy: n.createdBy?.toString() || null,
          createdAt: n.createdAt,
        })),
      },
    });
}, (error) => handleApiError(error, 'admin_notes_list'));

export const POST = wrapRoute(async function POST(req) {
    const requireAdminAndStepUp = withAdmin(
      withStepUp(async (_req, user) => ({ user }), {
        stepUpMessage: 'step-up required',
        stepUpStatus: 403,
      }),
      { forbiddenMessage: 'forbidden', forbiddenStatus: 403 }
    );
    const guardResult = await requireAdminAndStepUp(req);
    if (guardResult instanceof NextResponse) return guardResult;
    const { user } = guardResult;

    const body = await parseJson(req, {});
    const { targetType, targetId: rawTargetId, note, visibility } = body || {};

    if (!targetType || !rawTargetId || !note) {
      return fail('targetType, targetId and note are required', 400);
    }

    const targetId = sanitizeObjectId(rawTargetId);
    if (!targetId) {
      return fail('invalid target id', 400);
    }

    await connectDB();
    const resolvedVisibility = visibility === 'user_visible' ? 'user_visible' : 'internal';
    const created = await AdminNote.create({
      targetType,
      targetId,
      note,
      visibility: resolvedVisibility,
      createdBy: user.id,
    });

    await logAdminAction({
      actorUserId: user.id,
      action: SECURITY_EVENTS.ADMIN_NOTE_CREATED,
      targetType,
      targetId,
      metadata: {},
      req,
    });

    return NextResponse.json({
      success: true,
      message: 'note added',
      data: {
        id: created._id.toString(),
      },
    });
}, (error) => handleApiError(error, 'admin_notes_create'));

