import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import BlockedIp from '@/models/BlockedIp';
import { SECURITY_EVENTS, logAdminAction } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { withAdmin, withStepUp, fail, wrapRoute, parseJson } from '@/lib/http';
import {
  addBlockedIpToCache,
  removeBlockedIpFromCache,
  refreshBlockedIpCache,
  isValidIpString,
  activeBlockedIpFilter,
  PERMANENT_BLOCK_UNTIL,
} from '@/lib/validate-ip-abuse';

export const dynamic = 'force-dynamic';

function defaultBlockHours() {
  const raw = process.env.ADMIN_BLOCK_IP_DEFAULT_HOURS;
  const n = parseInt(String(raw || '168'), 10);
  if (!Number.isFinite(n) || n <= 0) return 168;
  return Math.min(n, 8760);
}

export const GET = wrapRoute(async function GET(req) {
  const requireAdmin = withAdmin(async (_req, user) => ({ user }), {
    forbiddenMessage: 'forbidden',
    forbiddenStatus: 403,
  });
  const guardResult = await requireAdmin(req);
  if (guardResult instanceof NextResponse) return guardResult;

  await connectDB();
  const rows = await BlockedIp.find(activeBlockedIpFilter())
    .sort({ permanent: -1, blockedUntil: 1 })
    .lean();

  return NextResponse.json({
    success: true,
    data: {
      blockedIps: rows.map((r) => ({
        id: r._id.toString(),
        ip: r.ip,
        blockedUntil: r.blockedUntil,
        permanent: !!r.permanent,
        reason: r.reason || '',
        createdAt: r.createdAt,
      })),
    },
  });
}, (error) => handleApiError(error, 'admin_blocked_ips_get'));

export const POST = wrapRoute(async function POST(req) {
  const requireAdminAndStepUp = withAdmin(
    withStepUp(async (_req, actor) => ({ actor }), {
      stepUpMessage: 'step-up required',
      stepUpStatus: 403,
    }),
    { forbiddenMessage: 'forbidden', forbiddenStatus: 403 }
  );
  const guardResult = await requireAdminAndStepUp(req);
  if (guardResult instanceof NextResponse) return guardResult;
  const { actor } = guardResult;

  const body = await parseJson(req, {});
  const ip = typeof body.ip === 'string' ? body.ip.trim() : '';
  if (!isValidIpString(ip)) {
    return fail('invalid ip address', 400);
  }
  const hoursRaw = body.blockedHours;
  let permanent =
    body.permanent === true ||
    body.permanent === 'true' ||
    body.permanent === 1 ||
    body.permanent === '1';
  let hours = defaultBlockHours();
  if (!permanent && hoursRaw !== undefined && hoursRaw !== null && hoursRaw !== '') {
    const h = parseInt(String(hoursRaw), 10);
    if (h === -1) permanent = true;
    else {
      if (!Number.isFinite(h) || h <= 0) return fail('blockedHours must be a positive number or -1 for permanent', 400);
      hours = Math.min(h, 8760);
    }
  }
  const reason =
    typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim().slice(0, 120)
      : 'admin';

  await connectDB();
  const blockedUntil = permanent
    ? PERMANENT_BLOCK_UNTIL
    : new Date(Date.now() + hours * 60 * 60 * 1000);
  await BlockedIp.findOneAndUpdate(
    { ip },
    { ip, blockedUntil, permanent, reason },
    { upsert: true, new: true }
  );

  addBlockedIpToCache(ip);

  await logAdminAction({
    actorUserId: actor.id,
    action: SECURITY_EVENTS.ADMIN_BLOCKED_IP_ADDED,
    targetType: 'blocked_ip',
    targetId: ip,
    metadata: {
      blockedUntil: blockedUntil.toISOString(),
      permanent,
      reason,
    },
    req,
  });

  return NextResponse.json({
    success: true,
    message: 'ip blocked',
    data: {
      ip,
      blockedUntil: blockedUntil.toISOString(),
      permanent,
      reason,
    },
  });
}, (error) => handleApiError(error, 'admin_blocked_ips_post'));

export const PATCH = wrapRoute(async function PATCH(req) {
  const requireAdminAndStepUp = withAdmin(
    withStepUp(async (_req, actor) => ({ actor }), {
      stepUpMessage: 'step-up required',
      stepUpStatus: 403,
    }),
    { forbiddenMessage: 'forbidden', forbiddenStatus: 403 }
  );
  const guardResult = await requireAdminAndStepUp(req);
  if (guardResult instanceof NextResponse) return guardResult;
  const { actor } = guardResult;

  const body = await parseJson(req, {});
  const ip = typeof body.ip === 'string' ? body.ip.trim() : '';
  if (!ip || !isValidIpString(ip)) {
    return fail('invalid ip address', 400);
  }

  await connectDB();
  const doc = await BlockedIp.findOne({ ip });
  if (!doc) {
    return fail('ip not in block list', 404);
  }
  if (doc.permanent) {
    return NextResponse.json({
      success: true,
      message: 'already permanent',
      data: { ip, permanent: true, blockedUntil: doc.blockedUntil?.toISOString?.() },
    });
  }

  doc.permanent = true;
  doc.blockedUntil = PERMANENT_BLOCK_UNTIL;
  await doc.save();

  addBlockedIpToCache(ip);

  await logAdminAction({
    actorUserId: actor.id,
    action: SECURITY_EVENTS.ADMIN_BLOCKED_IP_MADE_PERMANENT,
    targetType: 'blocked_ip',
    targetId: ip,
    metadata: { blockedUntil: PERMANENT_BLOCK_UNTIL.toISOString() },
    req,
  });

  return NextResponse.json({
    success: true,
    message: 'block set to permanent',
    data: {
      ip,
      permanent: true,
      blockedUntil: PERMANENT_BLOCK_UNTIL.toISOString(),
    },
  });
}, (error) => handleApiError(error, 'admin_blocked_ips_patch'));

export const DELETE = wrapRoute(async function DELETE(req) {
  const requireAdminAndStepUp = withAdmin(
    withStepUp(async (_req, actor) => ({ actor }), {
      stepUpMessage: 'step-up required',
      stepUpStatus: 403,
    }),
    { forbiddenMessage: 'forbidden', forbiddenStatus: 403 }
  );
  const guardResult = await requireAdminAndStepUp(req);
  if (guardResult instanceof NextResponse) return guardResult;
  const { actor } = guardResult;

  const url = new URL(req.url);
  const ip = (url.searchParams.get('ip') || '').trim();
  if (!ip || !isValidIpString(ip)) {
    return fail('invalid or missing ip query param', 400);
  }

  await connectDB();
  const doc = await BlockedIp.findOneAndDelete({ ip });
  if (!doc) {
    removeBlockedIpFromCache(ip);
    await refreshBlockedIpCache().catch(() => {});
    return fail('ip not in block list', 404);
  }

  removeBlockedIpFromCache(ip);

  await logAdminAction({
    actorUserId: actor.id,
    action: SECURITY_EVENTS.ADMIN_BLOCKED_IP_REMOVED,
    targetType: 'blocked_ip',
    targetId: ip,
    metadata: {},
    req,
  });

  return NextResponse.json({ success: true, message: 'ip unblocked' });
}, (error) => handleApiError(error, 'admin_blocked_ips_delete'));
