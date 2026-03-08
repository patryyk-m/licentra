import dns from 'node:dns/promises';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

const SECURITY_EVENTS = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILURE: 'login_failure',
  LOGOUT: 'logout',
  REGISTER_SUCCESS: 'register_success',
  REGISTER_FAILURE: 'register_failure',
  ACCESS_DENIED: 'access_denied',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  PASSWORD_CHANGED: 'password_changed',
  LICENSE_VALIDATION: 'license_validation',
  LICENSE_VALIDATION_FAILED: 'license_validation_failed',
  API_SECRET_RESET: 'api_secret_reset',
  APP_CREATED: 'app_created',
  APP_DELETED: 'app_deleted',
  LICENSE_CREATED: 'license_created',
  LICENSE_DELETED: 'license_deleted',
  ALL_SESSIONS_REVOKED: 'all_sessions_revoked',
  DATA_EXPORT: 'data_export',
  STEP_UP_SUCCESS: 'step_up_success',
  STEP_UP_FAILURE: 'step_up_failure',
  APP_SUSPENDED: 'app_suspended',
  APP_RESTORED: 'app_restored',
  APP_VALIDATION_BLOCKED_APP_SUSPENDED: 'app_validation_blocked_app_suspended',
  APP_SUSPENDED_PLAN_QUOTA: 'app_suspended_plan_quota',
  LICENSE_SUSPENDED: 'license_suspended',
  LICENSE_REACTIVATED: 'license_reactivated',
  BILLING_PLAN_CHANGED: 'billing_plan_changed',
  BILLING_CYCLE_CHANGED: 'billing_cycle_changed',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  USER_BLOCKED_SUSPENDED: 'user_blocked_suspended',
  USER_SUSPENDED: 'user_suspended',
  USER_UNSUSPENDED: 'user_unsuspended',
  ADMIN_NOTE_CREATED: 'admin_note_created',
  BULK_LICENSE_SUSPEND: 'bulk_license_suspend',
  PARTNER_CREDITS_GRANTED: 'partner_credits_granted',
  PARTNER_LICENSE_CREDIT_SPENT: 'partner_license_credit_spent',
  ADMIN_PLAN_CHANGED: 'admin_plan_changed',
  ADMIN_QUOTA_OVERRIDE_CHANGED: 'admin_quota_override_changed',
  ADMIN_QUOTA_RESET: 'admin_quota_reset',
};

// event types shown in Settings
export const USER_AUDIT_EVENT_TYPES = [
  SECURITY_EVENTS.LOGIN_SUCCESS,
  SECURITY_EVENTS.LOGIN_FAILURE,
  SECURITY_EVENTS.REGISTER_SUCCESS,
  SECURITY_EVENTS.REGISTER_FAILURE,
  SECURITY_EVENTS.LOGOUT,
  SECURITY_EVENTS.PASSWORD_CHANGED,
  SECURITY_EVENTS.ALL_SESSIONS_REVOKED,
  SECURITY_EVENTS.DATA_EXPORT,
  SECURITY_EVENTS.ACCESS_DENIED,
  SECURITY_EVENTS.RATE_LIMIT_EXCEEDED,
  SECURITY_EVENTS.STEP_UP_SUCCESS,
  SECURITY_EVENTS.STEP_UP_FAILURE,
  SECURITY_EVENTS.APP_CREATED,
  SECURITY_EVENTS.LICENSE_CREATED,
  SECURITY_EVENTS.USER_BLOCKED_SUSPENDED,
];

const DEFAULT_APP_URL = 'https://licentra.dev';
const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DANGEROUS_PATTERNS =
  /[$]|\.\.|__|{[\s]*\$|[\s]*\$[\s]*where|[\s]*\$[\s]*gt|[\s]*\$[\s]*ne|[\s]*\$[\s]*regex|[\s]*\$[\s]*options|[\s]*\$[\s]*in|[\s]*\$[\s]*nin|[\s]*\$[\s]*exists|[\s]*\$[\s]*elemMatch|[\s]*\$[\s]*size|[\s]*\$[\s]*type|[\s]*\$[\s]*mod|[\s]*\$[\s]*all|[\s]*\$[\s]*geo|[\s]*\$[\s]*near|[\s]*\$[\s]*text|[\s]*\$[\s]*search/i;

function getConfiguredAllowlist() {
  const configured = process.env.APP_URL_ALLOWLIST || '';
  const envUrls = [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL].filter(Boolean);
  const all = [...configured.split(','), ...envUrls]
    .map((v) => v?.trim())
    .filter(Boolean);
  return new Set(all);
}

function normalizeBaseUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function isPrivateOrLoopbackIp(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map((x) => Number(x));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fe80:')) return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    return false;
  }
  return true;
}

function isHttpAllowedInCurrentEnv() {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.ALLOW_INSECURE_HTTP_OUTBOUND === 'true';
}

function allowedPortsForEnv() {
  return isHttpAllowedInCurrentEnv() ? new Set(['443', '80']) : new Set(['443', '']);
}

async function resolveHostIps(hostname) {
  try {
    const records = await dns.lookup(hostname, { all: true });
    return records.map((r) => r.address).filter(Boolean);
  } catch {
    return [];
  }
}

export async function validateOutboundUrl(rawUrl, options = {}) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, reason: 'invalid_url' };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: 'invalid_url' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'url_credentials_not_allowed' };
  }

  const protocol = parsed.protocol.toLowerCase();
  const allowHttp = options.allowHttp ?? isHttpAllowedInCurrentEnv();
  if (protocol !== 'https:' && !(allowHttp && protocol === 'http:')) {
    return { valid: false, reason: 'protocol_not_allowed' };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return { valid: false, reason: 'host_not_allowed' };
  }

  const allowedPorts = options.allowedPorts ?? allowedPortsForEnv();
  if (!allowedPorts.has(parsed.port || '')) {
    return { valid: false, reason: 'port_not_allowed' };
  }

  if (net.isIP(host) && isPrivateOrLoopbackIp(host)) {
    return { valid: false, reason: 'private_ip_not_allowed' };
  }

  const allowlistHosts = Array.isArray(options.allowedHosts) ? options.allowedHosts : null;
  if (allowlistHosts && allowlistHosts.length > 0) {
    const ok = allowlistHosts.some((allowed) => {
      const val = String(allowed).toLowerCase().trim();
      return host === val || host.endsWith(`.${val}`);
    });
    if (!ok) return { valid: false, reason: 'host_not_in_allowlist' };
  }

  const enforceDnsRebind = options.enforceDnsRebind === true;
  if (enforceDnsRebind && !net.isIP(host)) {
    const ips = await resolveHostIps(host);
    if (ips.length === 0) return { valid: false, reason: 'dns_resolution_failed' };
    if (ips.some((ip) => isPrivateOrLoopbackIp(ip))) {
      return { valid: false, reason: 'dns_private_ip_not_allowed' };
    }
  }

  return { valid: true, url: parsed.toString() };
}

export async function assertSafeOutboundUrl(rawUrl, options = {}) {
  const checked = await validateOutboundUrl(rawUrl, options);
  if (!checked.valid) {
    const err = new Error(checked.reason || 'outbound_url_blocked');
    err.code = checked.reason || 'outbound_url_blocked';
    throw err;
  }
  return checked.url;
}

export async function safeFetch(rawUrl, options = {}, safetyOptions = {}) {
  let currentUrl = rawUrl;
  let redirects = 0;
  const timeoutMs = Number(safetyOptions.timeoutMs) > 0 ? Number(safetyOptions.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const maxResponseBytes =
    Number(safetyOptions.maxResponseBytes) > 0
      ? Number(safetyOptions.maxResponseBytes)
      : DEFAULT_MAX_RESPONSE_BYTES;
  const fetchOptions = { ...options, redirect: 'manual' };

  while (true) {
    await assertSafeOutboundUrl(currentUrl, safetyOptions);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(currentUrl, { ...fetchOptions, signal: controller.signal });
    clearTimeout(timer);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) return response;
      redirects += 1;
      if (redirects > MAX_REDIRECTS) {
        const err = new Error('too_many_redirects');
        err.code = 'too_many_redirects';
        throw err;
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    const contentLength = Number(response.headers.get('content-length') || '0');
    if (contentLength > 0 && contentLength > maxResponseBytes) {
      const err = new Error('response_too_large');
      err.code = 'response_too_large';
      throw err;
    }

    return response;
  }
}

export function getSafeAppBaseUrl() {
  const raw = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL;
  const normalized = normalizeBaseUrl(raw);
  const fallback = DEFAULT_APP_URL;
  if (!normalized) return fallback;

  try {
    const parsed = new URL(normalized);
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      return fallback;
    }
    const allowlist = getConfiguredAllowlist();
    if (allowlist.size > 0) {
      const host = parsed.hostname.toLowerCase();
      const allowed = [...allowlist]
        .map((entry) => {
          const normalizedEntry = normalizeBaseUrl(entry);
          if (!normalizedEntry) return null;
          return new URL(normalizedEntry).hostname.toLowerCase();
        })
        .filter(Boolean);
      if (!allowed.some((h) => host === h || host.endsWith(`.${h}`))) {
        return fallback;
      }
    }
    return normalized;
  } catch {
    return fallback;
  }
}

export function sanitizeForDb(value, maxLength = 1024) {
  if (value == null) return null;
  const str = String(value).trim();
  if (str.length === 0 || str.length > maxLength) return null;
  if (DANGEROUS_PATTERNS.test(str)) return null;
  return str;
}

export function sanitizeObjectId(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[a-fA-F0-9]{24}$/.test(trimmed)) return null;
  return trimmed;
}

export function sanitizeAlphanumeric(value, maxLength = 256) {
  if (value == null) return null;
  const str = String(value).trim().replace(/\s+/g, '');
  if (str.length === 0 || str.length > maxLength) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(str)) return null;
  return str;
}

export function sanitizeHwid(value) {
  if (value == null || typeof value !== 'string') return null;
  const str = value.trim().replace(/\s+/g, '').slice(0, 128);
  if (str.length === 0) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(str)) return null;
  return str;
}

export function handleApiError(error, context = '') {
  const isProduction = process.env.NODE_ENV === 'production';

  console.error(`[${context}] Error:`, {
    message: error?.message,
    stack: isProduction ? undefined : error?.stack,
    name: error?.name,
    timestamp: new Date().toISOString(),
  });

  let statusCode = 500;
  let message = 'internal server error';

  if (error?.name === 'ValidationError' || error?.name === 'ZodError') {
    statusCode = 400;
    message = 'validation error';
  } else if (error?.name === 'UnauthorizedError' || error?.message?.includes('Unauthorized')) {
    statusCode = 401;
    message = 'unauthorized';
  } else if (error?.name === 'ForbiddenError' || error?.message?.includes('Forbidden')) {
    statusCode = 403;
    message = 'forbidden';
  } else if (error?.name === 'NotFoundError') {
    statusCode = 404;
    message = 'resource not found';
  } else if (error?.code === 11000) {
    statusCode = 409;
    message = 'duplicate entry';
  } else if (error?.name === 'MongoServerError') {
    statusCode = 500;
    message = 'database error';
  }

  return NextResponse.json(
    {
      success: false,
      message,
      ...(isProduction ? {} : { _dev: { context, error: error?.message } }),
    },
    { status: statusCode }
  );
}

export function withErrorHandler(handler, context = '') {
  return async (req, params) => {
    try {
      return await handler(req, params);
    } catch (error) {
      return handleApiError(error, context || handler.name || 'API');
    }
  };
}

export function failSafeResponse(message = 'service unavailable', status = 503) {
  return NextResponse.json({ success: false, message }, { status });
}

export async function logSecurityEvent(event, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event,
    ...details,
  };

  const line = `[SECURITY] ${JSON.stringify(logEntry)}\n`;
  if (process.env.NODE_ENV !== 'production') {
    console.log('[SECURITY]', JSON.stringify(logEntry));
  }

  const logFile = process.env.SECURITY_LOG_FILE;
  if (logFile) {
    try {
      const resolved = path.isAbsolute(logFile) ? logFile : path.join(process.cwd(), logFile);
      fs.appendFileSync(resolved, line);
    } catch {
      // ignore file write errors
    }
  }

  try {
    const SecurityLog = (await import('../models/SecurityLog.js')).default;
    const doc = {
      event,
      ip: details.ip || 'unknown',
      userAgent: details.userAgent || 'unknown',
      resource: details.resource || '',
      reason: details.reason || '',
      details,
    };
    if (details.userId != null && details.userId !== '') {
      doc.userId = details.userId;
    }
    await SecurityLog.create(doc).catch(() => {});
  } catch {
    // ignore
  }
}

export function getClientIp(req) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

export function getUserAgent(req) {
  return req.headers.get('user-agent') || 'unknown';
}

export async function logAuthEvent(event, userId, req, additionalDetails = {}) {
  await logSecurityEvent(event, {
    userId,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    ...additionalDetails,
  });
}

export async function logAccessEvent(event, userId, resource, req, reason = '') {
  await logSecurityEvent(event, {
    userId,
    resource,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    reason,
  });
}

export async function logRateLimitEvent(ip, endpoint, req) {
  await logSecurityEvent(SECURITY_EVENTS.RATE_LIMIT_EXCEEDED, {
    ip,
    endpoint,
    userAgent: getUserAgent(req),
  });
}

export async function logAdminAction({ actorUserId, action, targetType, targetId, metadata = {}, req }) {
  const actionResource = metadata.resource || `admin:${action}`;
  const base = {
    userId: actorUserId || null,
    action,
    targetType,
    targetId,
    resource: actionResource,
    ip: req ? getClientIp(req) : 'unknown',
    userAgent: req ? getUserAgent(req) : 'unknown',
    ...metadata,
  };
  await logSecurityEvent(action, base);
}

export { SECURITY_EVENTS };
