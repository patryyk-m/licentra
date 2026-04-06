import net from 'node:net';
import { connectDB } from '@/lib/db';
import BlockedIp from '@/models/BlockedIp';
import IpStrike from '@/models/IpStrike';
import { logSecurityEvent, SECURITY_EVENTS } from '@/lib/security';
import { sendValidateIpAutoBlockDigestEmail } from '@/lib/email';

const TEST_HARDCODED_BLOCKED_IPS = new Set(
  String(process.env.VALIDATE_TEST_BLOCKED_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

/** in-memory set: reject validate spam before connectdb */
const blockedIpSet = new Set();
let periodicRefreshStarted = false;

/** max rows  */
const DIGEST_PENDING_MAX = 10;
/** min ms between digest emails */
const DIGEST_EMAIL_COOLDOWN_MS = 3600000;

const pendingDigestEvents = [];
let digestEmailLastSentAt = 0;

function isValidateIpAutoBlockAdminEmailEnabled() {
  return ['true', '1', 'yes'].includes(
    String(process.env.ENABLE_VALIDATE_IP_AUTO_BLOCK_ADMIN_EMAIL || '').toLowerCase()
  );
}

async function tryFlushAdminAutoBlockEmail() {
  if (!isValidateIpAutoBlockAdminEmailEnabled()) return;
  if (!pendingDigestEvents.length) return;
  const now = Date.now();
  if (digestEmailLastSentAt > 0 && now - digestEmailLastSentAt < DIGEST_EMAIL_COOLDOWN_MS) {
    return;
  }
  const batch = pendingDigestEvents.splice(0, pendingDigestEvents.length);
  try {
    await sendValidateIpAutoBlockDigestEmail(batch);
    digestEmailLastSentAt = Date.now();
  } catch (err) {
    pendingDigestEvents.unshift(...batch);
    console.error('[validate-ip-abuse] admin_auto_block_email_failed', err?.message || err);
  }
}

async function enqueueValidateIpAutoBlockAdminEmail(payload) {
  if (!isValidateIpAutoBlockAdminEmailEnabled()) return;
  pendingDigestEvents.push(payload);
  while (pendingDigestEvents.length > DIGEST_PENDING_MAX) {
    pendingDigestEvents.shift();
  }
  await tryFlushAdminAutoBlockEmail();
}

function startPeriodicRefresh() {
  if (periodicRefreshStarted || typeof setInterval === 'undefined') return;
  periodicRefreshStarted = true;
  setInterval(() => {
    void refreshBlockedIpCache().catch(() => {});
  }, 30_000);
}

export function isValidateIpAutoBlockEnabled() {
  return ['true', '1', 'yes'].includes(String(process.env.VALIDATE_IP_AUTO_BLOCK || '').toLowerCase());
}

function isStrikeConsoleLogEnabled() {
  return ['true', '1', 'yes'].includes(String(process.env.VALIDATE_IP_STRIKE_LOG || '').toLowerCase());
}

function normalizeIp(ip) {
  const s = String(ip || '').trim();
  return s || 'unknown';
}

export const PERMANENT_BLOCK_UNTIL = new Date('2099-12-31T23:59:59.999Z');

export function activeBlockedIpFilter(now = new Date()) {
  return {
    $or: [{ permanent: true }, { blockedUntil: { $gt: now } }],
  };
}

function getThresholds() {
  const strikes = parseInt(process.env.VALIDATE_IP_STRIKES_BEFORE_BLOCK || '25', 10);
  const windowMs = parseInt(process.env.VALIDATE_IP_STRIKE_WINDOW_MS || '600000', 10);
  const blockMs = parseInt(process.env.VALIDATE_IP_BLOCK_DURATION_MS || '3600000', 10);
  return {
    strikes: Number.isFinite(strikes) && strikes > 0 ? Math.min(strikes, 10000) : 25,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? Math.min(windowMs, 86400000) : 600000,
    blockMs: Number.isFinite(blockMs) && blockMs > 0 ? Math.min(blockMs, 604800000) : 3600000,
  };
}

/** reload active blocks from db */
export async function refreshBlockedIpCache() {
  await connectDB();
  const rows = await BlockedIp.find(activeBlockedIpFilter()).select('ip').lean();
  blockedIpSet.clear();
  for (const r of rows) {
    const n = normalizeIp(r.ip);
    if (n && n !== 'unknown') blockedIpSet.add(n);
  }
  startPeriodicRefresh();
}

export function addBlockedIpToCache(ip) {
  const n = normalizeIp(ip);
  if (n && n !== 'unknown') blockedIpSet.add(n);
}

export function removeBlockedIpFromCache(ip) {
  const n = normalizeIp(ip);
  if (n) blockedIpSet.delete(n);
}

/** sync, no db, use as first line in POST /api/licenses/validate */
export function isBlockedIpFast(ip) {
  const n = normalizeIp(ip);
  if (!n || n === 'unknown') return false;
  if (TEST_HARDCODED_BLOCKED_IPS.has(n)) return true;
  return blockedIpSet.has(n);
}

if (typeof setImmediate !== 'undefined') {
  setImmediate(() => {
    void refreshBlockedIpCache().catch(() => {});
  });
}

export function recordValidateStrike(ip, reason) {
  if (!isValidateIpAutoBlockEnabled()) return;
  void recordValidateStrikeAsync(ip, reason).catch((err) => {
    console.error('[validate-ip-abuse] record_strike_failed', err?.message || err);
  });
}

async function recordValidateStrikeAsync(ip, reason) {
  const n = normalizeIp(ip);
  if (!n || n === 'unknown') return;

  const { strikes: threshold, windowMs, blockMs } = getThresholds();
  const now = Date.now();

  await connectDB();

  let doc = await IpStrike.findOne({ ip: n });
  if (!doc) {
    doc = await IpStrike.create({ ip: n, strikes: 1, windowStart: new Date(now) });
  } else if (now - doc.windowStart.getTime() > windowMs) {
    doc.strikes = 1;
    doc.windowStart = new Date(now);
    await doc.save();
  } else {
    doc.strikes += 1;
    await doc.save();
  }

  if (isStrikeConsoleLogEnabled()) {
    console.warn('[licenses_validate] ip_strike', {
      ip: n,
      strikes: doc.strikes,
      threshold,
      reason: reason || 'validate_abuse',
    });
  }

  if (doc.strikes < threshold) return;

  const existing = await BlockedIp.findOne({ ip: n }).select('permanent').lean();
  if (existing?.permanent) {
    doc.strikes = 0;
    doc.windowStart = new Date(now);
    await doc.save();
    return;
  }

  const blockedUntil = new Date(now + blockMs);
  await BlockedIp.findOneAndUpdate(
    { ip: n },
    { ip: n, blockedUntil, permanent: false, reason: reason || 'validate_abuse' },
    { upsert: true }
  );

  addBlockedIpToCache(n);

  doc.strikes = 0;
  doc.windowStart = new Date(now);
  await doc.save();

  const r = reason || 'validate_abuse';
  console.warn('[licenses_validate] ip_auto_blocked', { ip: n, blockedUntil: blockedUntil.toISOString(), reason: r });
  logSecurityEvent(SECURITY_EVENTS.VALIDATE_IP_AUTO_BLOCKED, {
    ip: n,
    reason: r,
    blockedUntil: blockedUntil.toISOString(),
  }).catch(() => {});

  void enqueueValidateIpAutoBlockAdminEmail({
    ip: n,
    reason: r,
    blockedUntil: blockedUntil.toISOString(),
  }).catch((err) => {
    console.error('[validate-ip-abuse] admin_auto_block_email_enqueue', err?.message || err);
  });
}

export function isValidIpString(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  return net.isIP(s) !== 0;
}
