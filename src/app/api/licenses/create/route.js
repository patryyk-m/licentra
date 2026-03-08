import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import License from '@/models/License';
import App from '@/models/App';
import User from '@/models/User';
import PartnerCredit from '@/models/PartnerCredit';
import Notification from '@/models/Notification';
import { checkRateLimit } from '@/lib/ratelimit';
import { getLicenseRateLimit } from '@/lib/ratelimit';
import { hasAppAccess } from '@/lib/authz';
import { sanitizeObjectId, sanitizeForDb } from '@/lib/security';
import { handleApiError } from '@/lib/security';
import { SECURITY_EVENTS, logAdminAction, logSecurityEvent, getClientIp, getUserAgent } from '@/lib/security';
import { fail } from '@/lib/http';

function generateLicenseKey(mask, charset) {
  let key = '';
  for (const char of mask) {
    if (char === '*') {
      const randomIndex = Math.floor(Math.random() * charset.length);
      key += charset[randomIndex];
    } else if (char === '_') {
      key += '-';
    } else {
      key += char;
    }
  }
  return key;
}

export async function POST(req) {
  const rateLimited = checkRateLimit(req, getLicenseRateLimit('create'));
  if (rateLimited) return rateLimited;
  let debitedPartnerId = null;
  let debitedAppId = null;
  let debitedCount = 0;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return fail('Unauthorized', 401);
    }

    await connectDB();
    const body = await req.json();
    const createSchema = z.object({
      appId: z.string().min(1),
      count: z.number().int().min(1).max(50),
      mask: z.string().min(1).max(64),
      charset: z.string().min(1).max(128),
      expiryUnit: z.enum(['Days', 'Weeks', 'Months']).optional(),
      expiryDuration: z.number().int().min(0).optional(),
      note: z.string().max(500).optional().default(''),
      hwidLock: z.union([z.boolean(), z.string(), z.number()]).optional(),
      hwidLimit: z.number().int().min(1).max(5).optional(),
    });
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message || 'missing required fields';
      return fail(msg, 400);
    }
    const {
      appId: rawAppId,
      count,
      mask,
      charset,
      expiryUnit,
      expiryDuration,
      note,
      hwidLock,
      hwidLimit,
    } = parsed.data;

    const appId = sanitizeObjectId(rawAppId);
    if (!appId) {
      return fail('invalid app id', 400);
    }

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

    const isPartner = user.role === 'partner';
    const expiryDate = expiryDuration ? calculateExpiryDate(expiryUnit, expiryDuration) : null;

    if (isPartner) {
      const debit = await PartnerCredit.findOneAndUpdate(
        { appId, userId: user.id, balance: { $gte: count } },
        { $inc: { balance: -count }, $set: { updatedBy: user.id } },
        { new: true }
      ).lean();

      if (!debit) {
        return fail('insufficient partner credits', 403);
      }
      debitedPartnerId = user.id;
      debitedAppId = appId;
      debitedCount = count;
    }
    let effectiveMask = mask;
    let effectiveCharset = charset;

    if (isPartner && app.partnerLicenseConfig?.enabled) {
      const cfg = app.partnerLicenseConfig;
      effectiveMask = cfg.mask || mask;
      const charsetParts = [];
      if (cfg.lowercase ?? true) charsetParts.push('abcdefghijklmnopqrstuvwxyz');
      if (cfg.uppercase ?? true) charsetParts.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      if (cfg.numbers ?? true) charsetParts.push('0123456789');
      if (cfg.symbols ?? false) charsetParts.push('!@#');
      if (charsetParts.length === 0) {
        return fail('partner defaults are misconfigured, contact app owner', 400);
      }
      effectiveCharset = charsetParts.join('');
    }

    const generatedKeys = [];
    const hwidLockedValue = hwidLock === true || hwidLock === 'true' || hwidLock === 1;
    let normalizedHwidLimit;
    if (hwidLockedValue) {
      if (hwidLimit === undefined || hwidLimit === null || hwidLimit === '') {
        normalizedHwidLimit = 1;
      } else {
        const parsed = Number(hwidLimit);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
          return fail('hwid limit must be between 1 and 5 when hwid lock is enabled', 400);
        }
        normalizedHwidLimit = Math.floor(parsed);
      }
    }

    const safeNote = sanitizeForDb(note, 500) || '';
    for (let i = 0; i < count; i++) {
      const plainKey = generateLicenseKey(effectiveMask, effectiveCharset);

      await License.create({
        appId,
        key: plainKey,
        createdBy: user.id,
        note: safeNote,
        hwids: [], // will be populated when license is activated (if hwidLocked is true)
        hwidLocked: hwidLockedValue, // true if HWID lock is enabled during creation
        hwidLimit: normalizedHwidLimit,
        expiryDate,
        status: 'active',
      });

      generatedKeys.push(plainKey);
    }

    logSecurityEvent(SECURITY_EVENTS.LICENSE_CREATED, {
      userId: user.id,
      appId: app._id.toString(),
      count,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    }).catch(() => {});

    if (isPartner) {
      const partnerCredit = await PartnerCredit.findOne({ appId, userId: user.id })
        .select('balance')
        .lean();
      const remainingCredits = partnerCredit?.balance || 0;
      const recipients = await User.find({
        $or: [{ _id: app.ownerId }, { developerApps: app._id }],
      })
        .select('_id')
        .lean();
      await Notification.insertMany(
        recipients.map((recipient) => ({
          userId: recipient._id,
          appId: app._id,
          type: 'info',
          title: 'partner credits spent',
          message: `partner created ${count} license(s) and spent ${count} credit(s)`,
          severity: 'info',
          metadata: {
            action: 'partner_license_credit_spent',
            partnerUserId: user.id,
            creditsSpent: count,
            remainingCredits,
          },
        })),
        { ordered: false }
      ).catch(() => {});

      await logAdminAction({
        actorUserId: user.id,
        action: SECURITY_EVENTS.PARTNER_LICENSE_CREDIT_SPENT,
        targetType: 'app',
        targetId: app._id.toString(),
        metadata: {
          creditsSpent: count,
          remainingCredits,
        },
        req,
      });
    }

    return NextResponse.json({
      success: true,
      message: `${count} license(s) created`,
      data: { keys: generatedKeys },
    });
  } catch (error) {
    if (debitedPartnerId && debitedAppId && debitedCount > 0) {
      await PartnerCredit.findOneAndUpdate(
        { appId: debitedAppId, userId: debitedPartnerId },
        { $inc: { balance: debitedCount }, $set: { updatedBy: debitedPartnerId } }
      ).catch(() => {});
    }
    return handleApiError(error, 'licenses_create');
  }
}

function calculateExpiryDate(unit, duration) {
  const date = new Date();
  switch (unit) {
    case 'Days':
      date.setDate(date.getDate() + duration);
      break;
    case 'Weeks':
      date.setDate(date.getDate() + duration * 7);
      break;
    case 'Months':
      date.setMonth(date.getMonth() + duration);
      break;
    default:
      return null;
  }
  return date;
}

