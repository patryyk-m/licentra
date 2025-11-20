import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import License from '@/models/License';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';

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
  const rateLimited = checkRateLimit(req, 60, 1);
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user || !['developer', 'admin'].includes(user.role)) {
      return NextResponse.json(
        { success: false, message: 'Forbidden: insufficient permissions' },
        { status: 403 }
      );
    }

    await connectDB();
    const body = await req.json();
    const {
      appId,
      count,
      mask,
      charset,
      expiryUnit,
      expiryDuration,
      note,
      hwidLock,
      hwidLimit,
    } = body || {};

    if (!appId || !count || !mask || !charset) {
      return NextResponse.json(
        { success: false, message: 'missing required fields' },
        { status: 400 }
      );
    }

    if (count > 50) {
      return NextResponse.json(
        { success: false, message: 'maximum 50 licenses per batch' },
        { status: 400 }
      );
    }

    const app = await App.findById(appId);
    if (!app || app.status === 'suspended') {
      return NextResponse.json({ success: false, message: 'app not found' }, { status: 404 });
    }

    if (user.role !== 'admin' && app.ownerId.toString() !== user.id) {
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

    for (let i = 0; i < count; i++) {
      const plainKey = generateLicenseKey(mask, charset);

      await License.create({
        appId,
        key: plainKey,
        note: note || '',
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
    console.error('Create license error:', error);
    return NextResponse.json(
      { success: false, message: `internal server error: ${error.message}` },
      { status: 500 }
    );
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

