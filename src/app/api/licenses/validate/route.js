import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { checkRateLimit, getLicenseRateLimit, checkLicenseRateLimit, checkAppRateLimit } from '@/lib/ratelimit';
import { getEffectiveMonthlyQuota, getValidationsPerMinutePerApp } from '@/lib/plan-limits';
import { recordRateLimitEvent, checkAndCreateNotification } from '@/lib/email';
import { getClientIp, getUserAgent, logSecurityEvent, SECURITY_EVENTS } from '@/lib/security';
import App from '@/models/App';
import License from '@/models/License';
import ApiUsage from '@/models/ApiUsage';
import User from '@/models/User';
import { verifyPassword } from '@/lib/auth';
import { sanitizeObjectId, sanitizeHwid } from '@/lib/security';
import { handleApiError } from '@/lib/security';

const MAX_HWIDS = 5;

const clampHwidLimit = (value) => {
  if (value === undefined || value === null) return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_HWIDS);
};

const resolveEffectiveLimit = (licenseDoc) => {
  if (!licenseDoc) return MAX_HWIDS;
  const configuredLimit = clampHwidLimit(licenseDoc.hwidLimit);
  return licenseDoc.hwidLocked ? configuredLimit : MAX_HWIDS;
};

function responseInvalid(reason, req, meta = {}) {
  logSecurityEvent(SECURITY_EVENTS.LICENSE_VALIDATION_FAILED, {
    reason,
    appId: meta.appId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...meta,
  }).catch(() => {});
  return NextResponse.json({
    success: true,
    data: { valid: false, reason },
  });
}

const getMonthWindow = () => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { monthStart, nextMonthStart, monthKey };
};

export async function POST(req) {
  const rateLimited = checkRateLimit(req, getLicenseRateLimit('validate'));
  if (rateLimited) return rateLimited;

  try {
    const body = await req.json();
    const validateSchema = z.object({
      appId: z.string().min(1).max(64),
      apiSecret: z.string().min(1).max(256),
      licenseKey: z.string().min(1).max(256),
      hwid: z.string().max(256).optional().transform((v) => (v ? sanitizeHwid(v) : null)),
    });
    const parsed = validateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: 'appId, apiSecret and licenseKey are required' },
        { status: 400 }
      );
    }
    const { appId: rawAppId, apiSecret, licenseKey, hwid: parsedHwid } = parsed.data;
    const appId = sanitizeObjectId(rawAppId);
    const normalizedHwid = parsedHwid || '';
    const hasNormalizedHwid = Boolean(normalizedHwid);

    if (!appId || !apiSecret || !licenseKey) {
      return responseInvalid('app_not_found', req, { appId: rawAppId });
    }

    await connectDB();

    const app = await App.findById(appId).select(
      '+apiSecretHash status ownerId validationsPerMinutePerLicense quotaSuspended quotaSuspendedMonth suspensionReason'
    );
    if (!app) {
      return responseInvalid('app_not_found', req, { appId: appId?.toString() });
    }

    const { monthStart, nextMonthStart, monthKey } = getMonthWindow();

    const owner = await User.findById(app.ownerId).select('plan monthlyQuotaOverride').lean();
    const monthlyQuota = getEffectiveMonthlyQuota(owner?.plan, owner?.monthlyQuotaOverride);
    const currentMonthUsageAgg = await ApiUsage.aggregate([
      {
        $match: {
          userId: app.ownerId,
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
    const ownerOverQuota = currentMonthUsage >= monthlyQuota;

    if (
      app.status === 'suspended' &&
      (app.suspensionReason === 'plan_quota' || app.quotaSuspended) &&
      !ownerOverQuota
    ) {
      // quota suspension auto-resets once owner usage is below quota
      app.status = 'active';
      app.quotaSuspended = false;
      app.quotaSuspendedMonth = null;
      app.suspensionReason = 'none';
      await app.save();
    }

    if (app.status !== 'active') {
      await logSecurityEvent(SECURITY_EVENTS.APP_VALIDATION_BLOCKED_APP_SUSPENDED, {
        appId: app._id.toString(),
        appStatus: app.status,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      }).catch(() => {});
      return NextResponse.json(
        {
          success: false,
          message: 'app suspended',
        },
        { status: 403 }
      );
    }

    if (!app.apiSecretHash) {
      return NextResponse.json(
        { success: false, message: 'api secret not configured for this app' },
        { status: 400 }
      );
    }

    const isSecretValid = await verifyPassword(apiSecret, app.apiSecretHash);
    if (!isSecretValid) {
      return NextResponse.json(
        { success: false, message: 'invalid credentials' },
        { status: 401 }
      );
    }

    const perAppLimit = getValidationsPerMinutePerApp(owner?.plan);
    if (perAppLimit > 0) {
      const appLimitResult = await checkAppRateLimit(app._id, perAppLimit);
      if (appLimitResult.exceeded) {
        return NextResponse.json(
          { success: false, message: 'Too many validation requests for this app. Try again later.' },
          { status: 429 }
        );
      }
    }

    // plan quota (monthly, owner-level)
    if (currentMonthUsage >= monthlyQuota) {
      app.status = 'suspended';
      app.quotaSuspended = true;
      app.quotaSuspendedMonth = monthKey;
      app.suspensionReason = 'plan_quota';
      await app.save();
      await logSecurityEvent(SECURITY_EVENTS.APP_SUSPENDED_PLAN_QUOTA, {
        appId: app._id.toString(),
        appStatus: app.status,
        monthlyQuota,
        currentMonthUsage,
        resource: `admin:${SECURITY_EVENTS.APP_SUSPENDED_PLAN_QUOTA}`,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      }).catch(() => {});
      return NextResponse.json(
        { success: false, message: 'plan quota exceeded for this month. app suspended until quota resets.' },
        { status: 429 }
      );
    }

    const license = await License.findOne({
      appId: app._id,
      key: licenseKey,
    });

    if (!license) {
      return responseInvalid('license_not_found', req, { appId: app._id.toString() });
    }

    if (license.status !== 'active') {
      return responseInvalid('license_not_active', req, { appId: app._id.toString(), licenseId: license._id.toString() });
    }

    if (license.expiryDate && new Date(license.expiryDate) < new Date()) {
      return responseInvalid('license_expired', req, { appId: app._id.toString(), licenseId: license._id.toString() });
    }

    const perLicenseLimit = Math.min(
      Math.max(Number(app.validationsPerMinutePerLicense) || 10, 1),
      100
    );
    const licenseLimitResult = await checkLicenseRateLimit(license._id, perLicenseLimit);
    if (licenseLimitResult.exceeded) {
      const clientIp = getClientIp(req);
      await recordRateLimitEvent(app._id, license._id, clientIp);
      await checkAndCreateNotification(app._id, license._id);
      return NextResponse.json(
        { success: false, message: 'Too many validation requests for this license. Try again later.' },
        { status: 429 }
      );
    }

    const effectiveLimit = resolveEffectiveLimit(license);

    // add hwid if provided and theres room
    let refreshedLicense = null;
    if (hasNormalizedHwid) {
      const currentHwids = Array.isArray(license.hwids) ? [...license.hwids] : [];

      if (!currentHwids.includes(normalizedHwid)) {
        if (currentHwids.length >= effectiveLimit) {
          return responseInvalid('hwid_limit_reached');
        }

        license.hwids = [...currentHwids, normalizedHwid];
        license.markModified('hwids');
        const savedLicense = await license.save();
        refreshedLicense = savedLicense.toObject();
      }
    }

    if (!refreshedLicense) {
      refreshedLicense = await License.findById(license._id).lean();
    }

    const updatedHwids = Array.isArray(refreshedLicense?.hwids) ? refreshedLicense.hwids : [];
    const configuredLockLimit = clampHwidLimit(refreshedLicense?.hwidLimit);

    // if hwid lock is enabled, enforce hwid validation
    if (refreshedLicense.hwidLocked) {
      if (updatedHwids.length > 0) {
        if (!hasNormalizedHwid) {
          return responseInvalid('hwid_required', req, { appId: app._id.toString(), licenseId: license._id.toString() });
        }
        if (!updatedHwids.includes(normalizedHwid)) {
          return responseInvalid('hwid_mismatch', req, { appId: app._id.toString(), licenseId: license._id.toString() });
        }
      } else {
        if (!hasNormalizedHwid) {
          return responseInvalid('hwid_required', req, { appId: app._id.toString(), licenseId: license._id.toString() });
        }
      }
    }

    // track API usage (fire and forget)
    if (app.ownerId) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // track app-level usage
      ApiUsage.findOneAndUpdate(
        {
          userId: app.ownerId,
          appId: app._id,
          date: today,
          $or: [
            { licenseId: null },
            { licenseId: { $exists: false } },
          ],
        },
        { $inc: { count: 1 }, $setOnInsert: { licenseId: null } },
        { upsert: true, new: true }
      ).catch((err) => {
        console.error('failed to track app API usage:', err);
      });
      
      // track per-license usage
      const licenseIdToTrack = license._id;
      if (licenseIdToTrack) {
        ApiUsage.findOneAndUpdate(
          { userId: app.ownerId, appId: app._id, licenseId: licenseIdToTrack, date: today },
          { 
            $inc: { count: 1 }, 
            $setOnInsert: { 
              licenseId: licenseIdToTrack, 
              userId: app.ownerId, 
              appId: app._id, 
              date: today 
            } 
          },
          { upsert: true, new: true }
        ).catch((err) => {
          console.error('failed to track license API usage:', err);
        });
      }
    }

    logSecurityEvent(SECURITY_EVENTS.LICENSE_VALIDATION, {
      appId: app._id.toString(),
      licenseId: refreshedLicense._id.toString(),
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        license: {
          id: refreshedLicense._id.toString(),
          key: refreshedLicense.key,
          note: refreshedLicense.note,
          status: refreshedLicense.status,
          expiryDate: refreshedLicense.expiryDate,
          hwidLocked: refreshedLicense.hwidLocked,
          hwidLimit: configuredLockLimit,
          hwids: updatedHwids,
          createdAt: refreshedLicense.createdAt,
          updatedAt: refreshedLicense.updatedAt,
        },
      },
    });
  } catch (error) {
    return handleApiError(error, 'licenses_validate');
  }
}

