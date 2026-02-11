import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import License from '@/models/License';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getLicenseRateLimit } from '@/config/ratelimits';
import { hasAppAccess } from '@/lib/authz';
import { sanitizeObjectId, sanitizeForDb } from '@/lib/sanitize';
import { handleApiError } from '@/lib/errors';

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

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
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
      return NextResponse.json(
        { success: false, message: msg },
        { status: 400 }
      );
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
      return NextResponse.json(
        { success: false, message: 'invalid app id' },
        { status: 400 }
      );
    }

    const app = await App.findById(appId);
    if (!app || app.status === 'suspended') {
      return NextResponse.json({ success: false, message: 'app not found' }, { status: 404 });
    }

    const hasAccess = hasAppAccess(app, user);
    if (!hasAccess) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const expiryDate = expiryDuration ? calculateExpiryDate(expiryUnit, expiryDuration) : null;
    const generatedKeys = [];
    const hwidLockedValue = hwidLock === true || hwidLock === 'true' || hwidLock === 1;
    let normalizedHwidLimit;
    if (hwidLockedValue) {
      if (hwidLimit === undefined || hwidLimit === null || hwidLimit === '') {
        normalizedHwidLimit = 1;
      } else {
        const parsed = Number(hwidLimit);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
          return NextResponse.json(
            { success: false, message: 'hwid limit must be between 1 and 5 when hwid lock is enabled' },
            { status: 400 }
          );
        }
        normalizedHwidLimit = Math.floor(parsed);
      }
    }

    const safeNote = sanitizeForDb(note, 500) || '';
    for (let i = 0; i < count; i++) {
      const plainKey = generateLicenseKey(mask, charset);

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

    return NextResponse.json({
      success: true,
      message: `${count} license(s) created`,
      data: { keys: generatedKeys },
    });
  } catch (error) {
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

