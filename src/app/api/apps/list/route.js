import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleApiError } from '@/lib/security';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import ApiUsage from '@/models/ApiUsage';
import User from '@/models/User';
import { checkRateLimit, getAppRateLimit } from '@/lib/ratelimit';
import { normalizeRole, ROLE } from '@/lib/authz';
import { getEffectiveMonthlyQuota, getValidationsPerMinutePerLicense } from '@/lib/plan-limits';
import { fail, wrapRoute } from '@/lib/http';

export const GET = wrapRoute(async function GET(req) {
  const rateLimited = checkRateLimit(req, getAppRateLimit('list'));
  if (rateLimited) return rateLimited;
  const user = await authenticateUser(req);
  if (!user) {
    return fail('Unauthorized', 401);
  }

    await connectDB();

    const collaboratorIds = Array.isArray(user.developerApps) ? user.developerApps : [];
    const partnerAppIds = Array.isArray(user.partnerApps) ? user.partnerApps : [];
    const normalizedRole = normalizeRole(user.role);
    let query = { ownerId: user.id };

    if (normalizedRole === ROLE.PARTNER) {
      if (partnerAppIds.length === 0) {
        return NextResponse.json({ success: true, data: { apps: [] } });
      }

      query = { _id: { $in: partnerAppIds } };
    } else if (normalizedRole === ROLE.DEVELOPER && collaboratorIds.length > 0) {
      query = {
        $or: [
          { ownerId: user.id },
          { _id: { $in: collaboratorIds } },
        ],
      };
    }
    const apps = await App.find(query)
      .select('+apiSecretHash')
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // keep app status in sync with monthly owner plan quota in normal app views
    const syncCandidateApps = apps.filter(
      (a) =>
        a.status === 'active' ||
        (a.status === 'suspended' && (a.suspensionReason === 'plan_quota' || a.quotaSuspended))
    );
    if (syncCandidateApps.length > 0) {
      const ownerIdStrings = [...new Set(syncCandidateApps.map((a) => a.ownerId?.toString?.()).filter(Boolean))];
      const owners = ownerIdStrings.length > 0
        ? await User.find({ _id: { $in: ownerIdStrings } }).select('_id plan monthlyQuotaOverride').lean()
        : [];
      const ownerPlanMap = new Map(owners.map((o) => [o._id.toString(), { plan: o.plan || 'free', override: o.monthlyQuotaOverride }]));

      const usageByOwner = await ApiUsage.aggregate([
        {
          $match: {
            userId: { $in: owners.map((owner) => owner._id) },
            date: { $gte: monthStart, $lt: nextMonthStart },
            $or: [{ licenseId: null }, { licenseId: { $exists: false } }],
          },
        },
        {
          $group: {
            _id: '$userId',
            total: { $sum: '$count' },
          },
        },
      ]);
      const ownerUsageMap = new Map(usageByOwner.map((row) => [row._id.toString(), row.total || 0]));
      const ownersOverQuota = new Set(
        owners
          .filter((owner) => {
            const ownerId = owner._id.toString();
            const entry = ownerPlanMap.get(ownerId);
            const quota = getEffectiveMonthlyQuota(entry?.plan, entry?.override);
            const usage = ownerUsageMap.get(ownerId) || 0;
            return usage >= quota;
          })
          .map((owner) => owner._id.toString())
      );

      const shouldSuspendIds = syncCandidateApps
        .filter((app) => app.status === 'active')
        .filter((app) => {
          const ownerId = app.ownerId?.toString?.();
          return ownerId && ownersOverQuota.has(ownerId);
        })
        .map((app) => app._id);

      if (shouldSuspendIds.length > 0) {
        await App.updateMany(
          { _id: { $in: shouldSuspendIds } },
          {
            $set: {
              status: 'suspended',
              quotaSuspended: true,
              quotaSuspendedMonth: monthKey,
              suspensionReason: 'plan_quota',
            },
          }
        );
        const suspendedSet = new Set(shouldSuspendIds.map((id) => id.toString()));
        for (const app of apps) {
          if (suspendedSet.has(app._id.toString())) {
            app.status = 'suspended';
            app.quotaSuspended = true;
            app.quotaSuspendedMonth = monthKey;
            app.suspensionReason = 'plan_quota';
          }
        }
      }

      const shouldUnsuspendIds = syncCandidateApps
        .filter(
          (app) =>
            app.status === 'suspended' && (app.suspensionReason === 'plan_quota' || app.quotaSuspended)
        )
        .filter((app) => {
          const ownerId = app.ownerId?.toString?.();
          if (!ownerId) return false;
          // unsuspend immediately if owner is below quota
          return !ownersOverQuota.has(ownerId);
        })
        .map((app) => app._id);

      if (shouldUnsuspendIds.length > 0) {
        await App.updateMany(
          { _id: { $in: shouldUnsuspendIds } },
          {
            $set: {
              status: 'active',
              quotaSuspended: false,
              quotaSuspendedMonth: null,
              suspensionReason: 'none',
            },
          }
        );
        const unsuspendedSet = new Set(shouldUnsuspendIds.map((id) => id.toString()));
        for (const app of apps) {
          if (unsuspendedSet.has(app._id.toString())) {
            app.status = 'active';
            app.quotaSuspended = false;
            app.quotaSuspendedMonth = null;
            app.suspensionReason = 'none';
          }
        }
      }
    }

    const collaboratorSet = new Set(collaboratorIds.map((id) => id.toString()));

    const ownerIdsForPlan = [...new Set(apps.map((a) => a.ownerId?.toString?.()).filter(Boolean))];
    const ownersForPlans =
      ownerIdsForPlan.length > 0
        ? await User.find({ _id: { $in: ownerIdsForPlan } }).select('_id plan').lean()
        : [];
    const planByOwnerId = new Map(ownersForPlans.map((o) => [o._id.toString(), o.plan || 'free']));

    const sanitized = apps.map((a) => {
      const idString = a._id.toString();
      const ownerPlan = planByOwnerId.get(a.ownerId?.toString?.() || '') || 'free';
      return {
        id: idString,
        name: a.name,
        description: a.description || '',
        status: a.status,
        sortOrder: a.sortOrder || 0,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        hasApiSecret: !!a.apiSecretHash,
        validationsPerMinutePerLicense: getValidationsPerMinutePerLicense(ownerPlan),
        autoSuspendOnRateLimitAbuse: a.autoSuspendOnRateLimitAbuse ?? false,
        suspensionReason: a.suspensionReason || 'none',
        ownerId: a.ownerId?.toString?.() || '',
        partnerLicenseConfig: {
          enabled: a.partnerLicenseConfig?.enabled ?? false,
          mask: a.partnerLicenseConfig?.mask || '*****-****',
          lowercase: a.partnerLicenseConfig?.lowercase ?? true,
          uppercase: a.partnerLicenseConfig?.uppercase ?? true,
          numbers: a.partnerLicenseConfig?.numbers ?? true,
          symbols: a.partnerLicenseConfig?.symbols ?? false,
        },
        accessLevel: a.ownerId?.toString?.() === user.id
          ? 'owner'
          : collaboratorSet.has(idString)
            ? 'collaborator'
            : normalizedRole === ROLE.PARTNER
              ? 'partner'
              : 'none',
      };
    });

  return NextResponse.json({ success: true, data: { apps: sanitized } });
}, (error) => handleApiError(error, 'apps_list'));


