import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import ApiUsage from '@/models/ApiUsage';
import User from '@/models/User';
import { handleApiError, logSecurityEvent, SECURITY_EVENTS, getClientIp, getUserAgent } from '@/lib/security';
import { sanitizeForDb } from '@/lib/security';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAppRateLimit } from '@/lib/ratelimit';
import { getAppLimit, getEffectiveMonthlyQuota } from '@/lib/plan-limits';
import { fail } from '@/lib/http';

export async function POST(req) {
  const rateLimited = checkRateLimit(req, getAppRateLimit('create'));
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user || !['developer', 'admin'].includes(user.role)) {
      return fail('Forbidden: insufficient permissions', 403);
    }

    await connectDB();
    const body = await req.json();
    const rawName = (body?.name || '').trim();
    const rawDesc = (body?.description || '').trim();
    const name = sanitizeForDb(rawName, 40);
    const description = sanitizeForDb(rawDesc, 500) ?? '';

    if (!name || name.length < 2) {
      return fail('name must be between 2 and 40 characters', 400);
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const owner = await User.findById(user.id).select('_id plan monthlyQuotaOverride').lean();
    const ownerId = owner?._id || user.id;
    const appLimit = getAppLimit(owner?.plan || user.plan);
    if (appLimit >= 0) {
      const existingAppCount = await App.countDocuments({ ownerId });
      if (existingAppCount >= appLimit) {
        return fail(`plan limit reached: max ${appLimit} applications`, 403);
      }
    }

    const monthlyQuota = getEffectiveMonthlyQuota(owner?.plan || user.plan, owner?.monthlyQuotaOverride);
    const currentMonthUsageAgg = await ApiUsage.aggregate([
      {
        $match: {
          userId: ownerId,
          date: { $gte: monthStart, $lt: nextMonthStart },
          $or: [{ licenseId: null }, { licenseId: { $exists: false } }],
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$count' },
        },
      },
    ]);
    const currentMonthUsage = currentMonthUsageAgg?.[0]?.total || 0;
    const quotaExceeded = currentMonthUsage >= monthlyQuota;

    const app = await App.create({
      name,
      description: description || '',
      ownerId: user.id,
      apiSecretHash: '',
      status: quotaExceeded ? 'suspended' : 'active',
      quotaSuspended: quotaExceeded,
      quotaSuspendedMonth: quotaExceeded ? monthKey : null,
      suspensionReason: quotaExceeded ? 'plan_quota' : 'none',
    });

    logSecurityEvent(SECURITY_EVENTS.APP_CREATED, {
      userId: user.id,
      appId: app._id.toString(),
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Application created',
      data: {
        app: {
          id: app._id.toString(),
          name: app.name,
          description: app.description,
          status: app.status,
          createdAt: app.createdAt,
          updatedAt: app.updatedAt,
        }
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return fail('an app with this name already exists', 409);
    }
    return handleApiError(error, 'apps_create');
  }
}


