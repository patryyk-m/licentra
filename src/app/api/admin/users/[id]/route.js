import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import User from '@/models/User';
import { sanitizeObjectId } from '@/lib/security';
import { logAdminAction, SECURITY_EVENTS } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { withAdmin, withStepUp, parseJson, fail, wrapRoute } from '@/lib/http';

const patchSchema = z.object({
  plan: z.enum(['free', 'pro', 'business']).optional(),
  monthlyQuotaOverride: z.number().int().min(0).nullable().optional(),
}).strict();

export const dynamic = 'force-dynamic';

export const PATCH = wrapRoute(async function PATCH(req, context) {
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

    const params = await context.params;
    const targetUserId = sanitizeObjectId(params?.id);
    if (!targetUserId) {
      return fail('invalid user id', 400);
    }

    await connectDB();
    const body = await parseJson(req, {});
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return fail(parsed.error.errors[0]?.message || 'invalid body', 400);
    }

    const target = await User.findById(targetUserId);
    if (!target) {
      return fail('user not found', 404);
    }

    const updates = {};
    const metadata = {};

    if (parsed.data.plan !== undefined) {
      updates.plan = parsed.data.plan;
      metadata.previousPlan = target.plan;
      metadata.newPlan = parsed.data.plan;
    }

    if (Object.prototype.hasOwnProperty.call(parsed.data, 'monthlyQuotaOverride')) {
      const val = parsed.data.monthlyQuotaOverride;
      updates.monthlyQuotaOverride = val === null ? null : Math.floor(Number(val));
      metadata.previousOverride = target.monthlyQuotaOverride;
      metadata.newOverride = updates.monthlyQuotaOverride;
    }

    if (Object.keys(updates).length === 0) {
      return fail('no updates provided', 400);
    }

    await User.findByIdAndUpdate(targetUserId, { $set: updates });

    if (updates.plan !== undefined) {
      await logAdminAction({
        actorUserId: user.id,
        action: SECURITY_EVENTS.ADMIN_PLAN_CHANGED,
        targetType: 'user',
        targetId: targetUserId,
        metadata,
        req,
      });
    }
    if (updates.monthlyQuotaOverride !== undefined) {
      await logAdminAction({
        actorUserId: user.id,
        action: SECURITY_EVENTS.ADMIN_QUOTA_OVERRIDE_CHANGED,
        targetType: 'user',
        targetId: targetUserId,
        metadata,
        req,
      });
    }

    const updatedPlan = updates.plan ?? target.plan;
    const updatedOverride = updates.monthlyQuotaOverride !== undefined ? updates.monthlyQuotaOverride : target.monthlyQuotaOverride;

    return NextResponse.json({
      success: true,
      message: 'user updated',
      data: { plan: updatedPlan, monthlyQuotaOverride: updatedOverride },
    });
}, (error) => handleApiError(error, 'admin_user_patch'));
