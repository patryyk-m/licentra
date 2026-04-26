import { NextResponse } from 'next/server';
import { logRateLimitEvent, getClientIp } from './security';
import AppRateLimitBucket from '@/models/AppRateLimitBucket';
import LicenseRateLimitBucket from '@/models/LicenseRateLimitBucket';

// Simple in memory rate limiter
const rateLimitMap = new Map();

const UNLIMITED = { limit: 999999, windowMinutes: 1 };

// production rate limits (owasp a02 security misconfiguration)
const PROD_LIMITS = {
  auth: {
    login: { limit: 10, windowMinutes: 15 },
    register: { limit: 5, windowMinutes: 60 },
    refresh: { limit: 60, windowMinutes: 1 },
    logout: { limit: 30, windowMinutes: 1 },
    me: { limit: 180, windowMinutes: 1 },
    delete: { limit: 5, windowMinutes: 60 },
    forgotPassword: { limit: 3, windowMinutes: 60 },
    resetPassword: { limit: 5, windowMinutes: 60 },
    changePassword: { limit: 5, windowMinutes: 15 },
    exportData: { limit: 3, windowMinutes: 60 },
  },
  stripe: {
    checkout: { limit: 10, windowMinutes: 15 },
    webhook: { limit: 1000, windowMinutes: 1 },
    changePlan: { limit: 10, windowMinutes: 15 },
    cancelSubscription: { limit: 5, windowMinutes: 15 },
    portal: { limit: 15, windowMinutes: 15 },
  },
  licenses: {
    validate: { limit: 100, windowMinutes: 1 },
    create: { limit: 60, windowMinutes: 1 },
    update: { limit: 120, windowMinutes: 1 },
    delete: { limit: 30, windowMinutes: 1 },
    list: { limit: 120, windowMinutes: 1 },
    export: { limit: 10, windowMinutes: 15 },
  },
  apps: {
    create: { limit: 10, windowMinutes: 15 },
    update: { limit: 60, windowMinutes: 1 },
    delete: { limit: 10, windowMinutes: 15 },
    list: { limit: 120, windowMinutes: 1 },
    resetSecret: { limit: 5, windowMinutes: 15 },
    reorder: { limit: 60, windowMinutes: 1 },
    restore: { limit: 10, windowMinutes: 15 },
  },
  invites: {
    create: { limit: 20, windowMinutes: 15 },
    list: { limit: 120, windowMinutes: 1 },
    delete: { limit: 60, windowMinutes: 1 },
  },
  members: {
    remove: { limit: 20, windowMinutes: 15 },
  },
  partners: {
    claim: { limit: 10, windowMinutes: 15 },
  },
  collaborators: {
    claim: { limit: 10, windowMinutes: 15 },
  },
};

/** true = skip prod limit numbers and skip 429 */
function isRateLimitDisabledNow() {
  const raw = String(process.env.RATE_LIMIT_DISABLED || '').toLowerCase().trim();
  if (['false', '0', 'no'].includes(raw)) return false;
  if (process.env.NODE_ENV !== 'production') return true;
  return ['true', '1', 'yes'].includes(raw);
}

const useProdLimits = !isRateLimitDisabledNow();

function getLimit(category, name, subKey) {
  if (!useProdLimits) return UNLIMITED;
  const cat = PROD_LIMITS[category];
  if (!cat) return UNLIMITED;
  const val = subKey ? cat[name]?.[subKey] : cat[name];
  return val || UNLIMITED;
}

export const RATE_LIMITS = {
  auth: {
    login: getLimit('auth', 'login') || UNLIMITED,
    register: getLimit('auth', 'register') || UNLIMITED,
    refresh: getLimit('auth', 'refresh') || UNLIMITED,
    logout: getLimit('auth', 'logout') || UNLIMITED,
    me: getLimit('auth', 'me') || UNLIMITED,
    delete: getLimit('auth', 'delete') || UNLIMITED,
    forgotPassword: getLimit('auth', 'forgotPassword') || UNLIMITED,
    resetPassword: getLimit('auth', 'resetPassword') || UNLIMITED,
    changePassword: getLimit('auth', 'changePassword') || UNLIMITED,
    exportData: getLimit('auth', 'exportData') || UNLIMITED,
  },
  stripe: {
    checkout: getLimit('stripe', 'checkout') || UNLIMITED,
    webhook: getLimit('stripe', 'webhook') || UNLIMITED,
    changePlan: getLimit('stripe', 'changePlan') || UNLIMITED,
    cancelSubscription: getLimit('stripe', 'cancelSubscription') || UNLIMITED,
    portal: getLimit('stripe', 'portal') || UNLIMITED,
  },
  licenses: {
    validate: getLimit('licenses', 'validate') || UNLIMITED,
    create: getLimit('licenses', 'create') || UNLIMITED,
    update: getLimit('licenses', 'update') || UNLIMITED,
    delete: getLimit('licenses', 'delete') || UNLIMITED,
    list: getLimit('licenses', 'list') || UNLIMITED,
    export: getLimit('licenses', 'export') || UNLIMITED,
  },
  apps: {
    create: getLimit('apps', 'create') || UNLIMITED,
    update: getLimit('apps', 'update') || UNLIMITED,
    delete: getLimit('apps', 'delete') || UNLIMITED,
    list: getLimit('apps', 'list') || UNLIMITED,
    resetSecret: getLimit('apps', 'resetSecret') || UNLIMITED,
    reorder: getLimit('apps', 'reorder') || UNLIMITED,
    restore: getLimit('apps', 'restore') || UNLIMITED,
  },
  invites: {
    create: getLimit('invites', 'create') || UNLIMITED,
    list: getLimit('invites', 'list') || UNLIMITED,
    delete: getLimit('invites', 'delete') || UNLIMITED,
  },
  members: {
    remove: getLimit('members', 'remove') || UNLIMITED,
  },
  partners: {
    claim: getLimit('partners', 'claim') || UNLIMITED,
  },
  collaborators: {
    claim: getLimit('collaborators', 'claim') || UNLIMITED,
  },
};

export function getRateLimit(routeType, routeName) {
  const config = RATE_LIMITS[routeType]?.[routeName];
  if (!config) {
    return UNLIMITED;
  }
  return config;
}

export function getAuthRateLimit(routeName) {
  return getRateLimit('auth', routeName);
}

export function getLicenseRateLimit(routeName) {
  return getRateLimit('licenses', routeName);
}

export function getAppRateLimit(routeName) {
  return getRateLimit('apps', routeName);
}

export function getInviteRateLimit(routeName) {
  return getRateLimit('invites', routeName);
}

export function getMemberRateLimit(routeName) {
  return getRateLimit('members', routeName);
}

export function getPartnerRateLimit(routeName) {
  return getRateLimit('partners', routeName);
}

export function getCollaboratorRateLimit(routeName) {
  return getRateLimit('collaborators', routeName);
}

export function getStripeRateLimit(routeName) {
  return getRateLimit('stripe', routeName);
}

function evaluateRateLimitBucket(req, config) {
  if (!config || typeof config !== 'object') {
    console.error('[ratelimit] invalid config provided, using default');
    config = { limit: 60, windowMinutes: 1 };
  }

  const limit = config.limit ?? 60;
  const window = config.windowMinutes ?? 1;
  const clientIp = getClientIp(req);
  const url = new URL(req.url);
  const bucketKey = `${clientIp}:${req.method}:${url.pathname}`;

  const now = Date.now();
  const windowMs = window * 60 * 1000;

  const record = rateLimitMap.get(bucketKey);

  if (!record) {
    rateLimitMap.set(bucketKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { exceeded: false };
  }

  if (now > record.resetAt) {
    rateLimitMap.set(bucketKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { exceeded: false };
  }

  if (record.count >= limit) {
    logRateLimitEvent(clientIp, url.pathname, req).catch(() => {});
    return { exceeded: true };
  }

  record.count++;
  rateLimitMap.set(bucketKey, record);
  return { exceeded: false };
}

// Check rate limit and return if exceeded
export function checkRateLimit(req, config) {
  if (isRateLimitDisabledNow()) return null;

  const r = evaluateRateLimitBucket(req, config);
  if (!r.exceeded) return null;

  return NextResponse.json(
    {
      success: false,
      message: 'Too many requests. Please try again later.',
    },
    { status: 429 }
  );
}

/**
 * validate route only: always updates the ip bucket so strikes can fire even when
 * RATE_LIMIT_DISABLED / non-prod suppresses 429 responses.
 */
export function checkRateLimitValidate(req, config) {
  const r = evaluateRateLimitBucket(req, config);
  if (!r.exceeded) return { response: null, strike: false };
  if (isRateLimitDisabledNow()) {
    return { response: null, strike: true };
  }
  return {
    response: NextResponse.json(
      {
        success: false,
        message: 'Too many requests. Please try again later.',
      },
      { status: 429 }
    ),
    strike: true,
  };
}

// Clean up old rate limit records
export function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

// Clean up every 5 minutes
setInterval(cleanupRateLimit, 5 * 60 * 1000);

function getBucketStart(now = new Date()) {
  const bucketStart = new Date(now);
  bucketStart.setSeconds(0, 0);
  return bucketStart;
}

async function incrementBucket(Model, query, bucketStart) {
  try {
    return await Model.findOneAndUpdate(
      { ...query, bucketStart },
      { $inc: { count: 1 }, $setOnInsert: { createdAt: new Date() } },
      { new: true, upsert: true }
    ).lean();
  } catch (e) {
    if (e?.code === 11000) {
      return await Model.findOneAndUpdate(
        { ...query, bucketStart },
        { $inc: { count: 1 } },
        { new: true }
      ).lean();
    }
    throw e;
  }
}

export async function checkAppRateLimit(appId, limitPerMinute) {
  const limit = Math.max(Number(limitPerMinute) || 0, 0);
  if (limit <= 0) return { exceeded: false, count: 0, limit };
  const bucketStart = getBucketStart();
  const doc = await incrementBucket(AppRateLimitBucket, { appId }, bucketStart);
  const count = doc?.count ?? 1;
  return { exceeded: count > limit, count, limit, bucketStart };
}

export async function checkLicenseRateLimit(licenseId, limitPerMinute) {
  const limit = Math.min(Math.max(Number(limitPerMinute) || 10, 1), 100);
  const bucketStart = getBucketStart();
  const doc = await incrementBucket(LicenseRateLimitBucket, { licenseId }, bucketStart);
  const count = doc?.count ?? 1;
  return { exceeded: count > limit, count, limit, bucketStart };
}

