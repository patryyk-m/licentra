import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import User from '@/models/User';
import ApiUsage from '@/models/ApiUsage';
import { sanitizeObjectId } from '@/lib/security';
import { logAdminAction, SECURITY_EVENTS } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { withAdmin, withStepUp, wrapRoute } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const POST = wrapRoute(async function POST(req, context) {
    const requireAdminAndStepUp = withAdmin(
      withStepUp(async (_req, user) => ({ user }), { stepUpMessage: 'step-up required' }),
      { forbiddenMessage: 'forbidden', forbiddenStatus: 403 }
    );
    const guardResult = await requireAdminAndStepUp(req);
    if (guardResult instanceof NextResponse) return guardResult;
    const { user } = guardResult;

    const params = await context.params;
    const targetUserId = sanitizeObjectId(params?.id);
    if (!targetUserId) {
      return NextResponse.json({ success: false, message: 'invalid user id' }, { status: 400 });
    }

    await connectDB();
    const target = await User.findById(targetUserId);
    if (!target) {
      return NextResponse.json({ success: false, message: 'user not found' }, { status: 404 });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const result = await ApiUsage.deleteMany({
      userId: targetUserId,
      date: { $gte: monthStart, $lt: nextMonthStart },
    });

    await logAdminAction({
      actorUserId: user.id,
      action: SECURITY_EVENTS.ADMIN_QUOTA_RESET,
      targetType: 'user',
      targetId: targetUserId,
      metadata: { deletedCount: result.deletedCount ?? 0, month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` },
      req,
    });

    return NextResponse.json({
      success: true,
      message: 'quota reset for current month',
      data: { deletedCount: result.deletedCount ?? 0 },
    });
}, (error) => handleApiError(error, 'admin_reset_quota'));
