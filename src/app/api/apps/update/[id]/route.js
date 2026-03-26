import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAppRateLimit } from '@/lib/ratelimit';
import { hasAppAccess } from '@/lib/authz';
import { sanitizeObjectId, sanitizeForDb } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { fail } from '@/lib/http';
import { getValidationsPerMinutePerLicense } from '@/lib/plan-limits';
import User from '@/models/User';

export async function PATCH(req, { params }) {
  const rateLimited = checkRateLimit(req, getAppRateLimit('update'));
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return fail('Unauthorized', 401);
    }

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

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (
      app.status === 'suspended' &&
      (app.suspensionReason === 'plan_quota' || app.quotaSuspended) &&
      app.quotaSuspendedMonth !== monthKey
    ) {
      app.status = 'active';
      app.quotaSuspended = false;
      app.quotaSuspendedMonth = null;
      app.suspensionReason = 'none';
      await app.save();
    }

    const hasAccess = hasAppAccess(app, user);
    if (!hasAccess) {
      return fail('Forbidden', 403);
    }

    const isAdmin = user.role === 'admin';
    const isOwner = app.ownerId?.toString() === user.id;
    const isCollaborator = Array.isArray(user.developerApps)
      ? user.developerApps.some((appRef) => appRef?.toString() === app._id.toString())
      : false;

    if (!isAdmin && !isOwner && !isCollaborator) {
      return fail('Forbidden', 403);
    }

    const body = await req.json();
    const updates = {};
    if (typeof body?.name === 'string') {
      const nm = sanitizeForDb(body.name.trim(), 40);
      if (!nm || nm.length < 2) {
        return fail('name must be between 2 and 40 characters', 400);
      }
      updates.name = nm;
    }
    if (typeof body?.description === 'string') {
      const desc = sanitizeForDb(body.description.trim(), 500);
      updates.description = desc ?? '';
    }
    if (typeof body?.autoSuspendOnRateLimitAbuse === 'boolean') {
      updates.autoSuspendOnRateLimitAbuse = body.autoSuspendOnRateLimitAbuse;
    }

    if (body?.partnerLicenseConfig && typeof body.partnerLicenseConfig === 'object') {
      if (!isOwner && !isAdmin) {
        return fail('only the app owner or admin can update partner defaults', 403);
      }
      const cfg = body.partnerLicenseConfig;
      const enabled = Boolean(cfg.enabled);
      const rawMask = typeof cfg.mask === 'string' ? cfg.mask.trim() : '';
      const mask = sanitizeForDb(rawMask || '*****-****', 64);
      const lowercase = Boolean(cfg.lowercase);
      const uppercase = Boolean(cfg.uppercase);
      const numbers = Boolean(cfg.numbers);
      const symbols = Boolean(cfg.symbols);
      if (enabled && !lowercase && !uppercase && !numbers && !symbols) {
        return fail('partner defaults must include at least one character set', 400);
      }
      updates.partnerLicenseConfig = {
        enabled,
        mask,
        lowercase,
        uppercase,
        numbers,
        symbols,
      };
    }

    if (Object.keys(updates).length === 0) {
      return fail('no updates provided', 400);
    }

    Object.assign(app, updates);
    await app.save();

    const ownerForLimits = await User.findById(app.ownerId).select('plan').lean();
    const validationsPerMinutePerLicense = getValidationsPerMinutePerLicense(ownerForLimits?.plan);

    return NextResponse.json({
      success: true,
      message: 'Application updated',
      data: {
        app: {
          id: app._id.toString(),
          name: app.name,
          description: app.description || '',
          status: app.status,
          validationsPerMinutePerLicense,
          autoSuspendOnRateLimitAbuse: app.autoSuspendOnRateLimitAbuse ?? false,
          partnerLicenseConfig: {
            enabled: app.partnerLicenseConfig?.enabled ?? false,
            mask: app.partnerLicenseConfig?.mask || '*****-****',
            lowercase: app.partnerLicenseConfig?.lowercase ?? true,
            uppercase: app.partnerLicenseConfig?.uppercase ?? true,
            numbers: app.partnerLicenseConfig?.numbers ?? true,
            symbols: app.partnerLicenseConfig?.symbols ?? false,
          },
          createdAt: app.createdAt,
          updatedAt: app.updatedAt,
        },
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return fail('an app with this name already exists', 409);
    }
    return handleApiError(error, 'apps_update');
  }
}


