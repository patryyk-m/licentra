import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import {
  checkRateLimitValidate,
  getLicenseRateLimit,
  checkLicenseRateLimit,
  checkAppRateLimit,
} from '@/lib/ratelimit';
import {
  getEffectiveMonthlyQuota,
  getValidationsPerMinutePerApp,
  getValidationsPerMinutePerLicense,
} from '@/lib/plan-limits';
import { recordRateLimitEvent, checkAndCreateNotification, sendPlanQuotaWarningEmail } from '@/lib/email';
import { getClientIp, getUserAgent, logSecurityEvent, SECURITY_EVENTS } from '@/lib/security';
import { isBlockedIpFast, recordValidateStrike } from '@/lib/validate-ip-abuse';
import App from '@/models/App';
import License from '@/models/License';
import ApiUsage from '@/models/ApiUsage';
import User from '@/models/User';
import { verifyPassword } from '@/lib/auth';
import { sanitizeObjectId, sanitizeHwid } from '@/lib/security';
import { handleApiError } from '@/lib/security';

const MAX_HWIDS = 5;

function logValidateConcurrentReject(kind, detail = {}) {
  console.warn('[licenses_validate] concurrent_limit', kind, detail);
}

let validateInFlight = 0;
const validateInFlightByIp = new Map();
const validateInFlightByLicenseId = new Map();

function getValidateMaxConcurrent() {
  const raw = process.env.VALIDATE_MAX_CONCURRENT;
  if (raw === undefined || raw === '') return 12;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, 500);
}

/** one ip cannot hold all global slots */
function getValidateMaxConcurrentPerIp() {
  const raw = process.env.VALIDATE_MAX_CONCURRENT_PER_IP;
  if (raw === undefined || raw === '') return 4;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, 100);
}

function getValidateMaxConcurrentPerLicense() {
  const raw = process.env.VALIDATE_MAX_CONCURRENT_PER_LICENSE;
  if (raw === undefined || raw === '') return 6;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, 100);
}

function isPlanQuotaWarningEmailEnabled() {
  return ['true', '1', 'yes'].includes(String(process.env.ENABLE_PLAN_QUOTA_WARNING_EMAIL || '').toLowerCase());
}

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

/** wrong app id / license / state — counts toward ip auto-block when VALIDATE_IP_AUTO_BLOCK is on */
const STRIKE_ON_INVALID_VALIDATE_REASONS = new Set([
  'app_not_found',
  'license_not_found',
  'license_not_active',
  'license_expired',
]);

function responseInvalid(reason, req, meta = {}) {
  if (req && STRIKE_ON_INVALID_VALIDATE_REASONS.has(reason)) {
    recordValidateStrike(getClientIp(req), `validate_${reason}`);
  }
  logSecurityEvent(SECURITY_EVENTS.LICENSE_VALIDATION_FAILED, {
    reason,
    appId: meta.appId,
    ip: req ? getClientIp(req) : 'unknown',
    userAgent: req ? getUserAgent(req) : 'unknown',
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
  const clientIp = getClientIp(req);

  if (isBlockedIpFast(clientIp)) {
    return NextResponse.json({ success: false, message: 'access denied' }, { status: 403 });
  }

  const ipRate = checkRateLimitValidate(req, getLicenseRateLimit('validate'));
  if (ipRate.strike) {
    recordValidateStrike(clientIp, 'ip_rate_limit');
  }
  if (ipRate.response) {
    return ipRate.response;
  }
  const maxPerIp = getValidateMaxConcurrentPerIp();
  const maxGlobal = getValidateMaxConcurrent();

  if (maxPerIp > 0) {
    const cur = validateInFlightByIp.get(clientIp) || 0;
    if (cur >= maxPerIp) {
      logValidateConcurrentReject('per_ip', { ip: clientIp, limit: maxPerIp, inFlight: cur });
      recordValidateStrike(clientIp, 'per_ip_concurrent');
      return NextResponse.json(
        {
          success: false,
          message: 'Too many parallel validation requests from this address. Slow down and try again.',
        },
        { status: 429 }
      );
    }
  }

  if (maxGlobal > 0) {
    if (validateInFlight >= maxGlobal) {
      logValidateConcurrentReject('global', { limit: maxGlobal, inFlight: validateInFlight });
      return NextResponse.json(
        {
          success: false,
          message: 'Too many concurrent validation requests. Try again later.',
        },
        { status: 429 }
      );
    }
  }

  let acquiredPerIp = false;
  let acquiredGlobal = false;
  let acquiredLicenseConcurrent = false;
  let licenseIdForConcurrent = null;

  if (maxPerIp > 0) {
    validateInFlightByIp.set(clientIp, (validateInFlightByIp.get(clientIp) || 0) + 1);
    acquiredPerIp = true;
  }
  if (maxGlobal > 0) {
    validateInFlight += 1;
    acquiredGlobal = true;
  }

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
      '+apiSecretHash status ownerId quotaSuspended quotaSuspendedMonth suspensionReason'
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

    // Plan quota warning email: ENABLE_PLAN_QUOTA_WARNING_EMAIL=true (pro/business only, once at 90% usage)
    if (isPlanQuotaWarningEmailEnabled()) {
      const paidPlan = ['pro', 'business'].includes(String(owner?.plan || 'free').toLowerCase());
      if (paidPlan && monthlyQuota > 0 && !ownerOverQuota) {
        const warnAt = Math.floor(monthlyQuota * 0.9);
        if (warnAt > 0 && currentMonthUsage === warnAt) {
          const ownerForEmail = await User.findById(app.ownerId).select('email username').lean();
          if (ownerForEmail?.email) {
            sendPlanQuotaWarningEmail({
              to: ownerForEmail.email,
              username: ownerForEmail.username || 'there',
              appName: app.name || 'your app',
              appId: app._id.toString(),
              currentMonthUsage,
              monthlyQuota,
            }).catch(() => {});
          }
        }
      }
    }

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
      recordValidateStrike(clientIp, 'app_suspended_validate');
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

    // plan quota (monthly) before bcrypt — avoids expensive verify when owner is already over quota
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

    const isSecretValid = await verifyPassword(apiSecret, app.apiSecretHash);
    if (!isSecretValid) {
      recordValidateStrike(clientIp, 'invalid_api_secret');
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

    const maxConcurrentPerLicense = getValidateMaxConcurrentPerLicense();
    licenseIdForConcurrent = license._id.toString();
    if (maxConcurrentPerLicense > 0) {
      const licCur = validateInFlightByLicenseId.get(licenseIdForConcurrent) || 0;
      if (licCur >= maxConcurrentPerLicense) {
        logValidateConcurrentReject('per_license', {
          licenseId: licenseIdForConcurrent,
          limit: maxConcurrentPerLicense,
          inFlight: licCur,
        });
        return NextResponse.json(
          {
            success: false,
            message: 'Too many parallel validation requests for this license. Try again later.',
          },
          { status: 429 }
        );
      }
      validateInFlightByLicenseId.set(licenseIdForConcurrent, licCur + 1);
      acquiredLicenseConcurrent = true;
    }

    const perLicenseLimit = getValidationsPerMinutePerLicense(owner?.plan);
    const licenseLimitResult = await checkLicenseRateLimit(license._id, perLicenseLimit);
    if (licenseLimitResult.exceeded) {
      const ipForEvent = getClientIp(req);
      recordRateLimitEvent(app._id, license._id, ipForEvent).catch(() => {});
      checkAndCreateNotification(app._id, license._id).catch(() => {});
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
  } finally {
    if (acquiredLicenseConcurrent && licenseIdForConcurrent) {
      const ln = (validateInFlightByLicenseId.get(licenseIdForConcurrent) || 0) - 1;
      if (ln <= 0) validateInFlightByLicenseId.delete(licenseIdForConcurrent);
      else validateInFlightByLicenseId.set(licenseIdForConcurrent, ln);
    }
    if (acquiredPerIp) {
      const next = (validateInFlightByIp.get(clientIp) || 0) - 1;
      if (next <= 0) validateInFlightByIp.delete(clientIp);
      else validateInFlightByIp.set(clientIp, next);
    }
    if (acquiredGlobal) validateInFlight -= 1;
  }
}

