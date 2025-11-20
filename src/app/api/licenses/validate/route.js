import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { checkRateLimit } from '@/lib/ratelimit';
import App from '@/models/App';
import License from '@/models/License';
import { verifyPassword } from '@/lib/crypto';
import mongoose from 'mongoose';

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

const responseInvalid = (reason) =>
  NextResponse.json({
    success: true,
    data: { valid: false, reason },
  });

export async function POST(req) {
  const rateLimited = checkRateLimit(req, 120, 1);
  if (rateLimited) return rateLimited;

  try {
    const body = await req.json();
    const appId = body?.appId?.trim();
    const apiSecret = body?.apiSecret?.trim();
    const licenseKey = body?.licenseKey?.trim();
    const hwid = body?.hwid?.trim();

    if (!appId || !apiSecret || !licenseKey) {
      return NextResponse.json(
        { success: false, message: 'appId, apiSecret and licenseKey are required' },
        { status: 400 }
      );
    }

    await connectDB();

    if (!mongoose.Types.ObjectId.isValid(appId)) {
      return responseInvalid('app_not_found');
    }

    const app = await App.findById(appId).select('+apiSecretHash status ownerId');
    if (!app || app.status === 'suspended') {
      return responseInvalid('app_not_found');
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

    const license = await License.findOne({
      appId: app._id,
      key: licenseKey,
    });

    if (!license) {
      return responseInvalid('license_not_found');
    }

    if (license.status !== 'active') {
      return responseInvalid('license_not_active');
    }

    if (license.expiryDate && new Date(license.expiryDate) < new Date()) {
      return responseInvalid('license_expired');
    }

    const effectiveLimit = resolveEffectiveLimit(license);

    // add hwid if provided and theres room
    let refreshedLicense = null;
    if (hwid) {
      const currentHwids = Array.isArray(license.hwids) ? [...license.hwids] : [];

      if (!currentHwids.includes(hwid)) {
        if (currentHwids.length >= effectiveLimit) {
          return responseInvalid('hwid_limit_reached');
        }

        license.hwids = [...currentHwids, hwid];
        license.markModified('hwids');
        const savedLicense = await license.save();
        refreshedLicense = savedLicense.toObject();
      }
    }

    if (!refreshedLicense) {
      refreshedLicense = await License.findById(license._id).lean();
    }

    const updatedHwids = Array.isArray(refreshedLicense?.hwids) ? refreshedLicense.hwids : [];
    const configuredLimit = clampHwidLimit(refreshedLicense?.hwidLimit);

    // if hwid lock is enabled, enforce hwid validation
    if (refreshedLicense.hwidLocked) {
      if (updatedHwids.length > 0) {
        // hwids already exist, must provide matching hwid
        if (!hwid) {
          return responseInvalid('hwid_required');
        }
        if (!updatedHwids.includes(hwid)) {
          // hwid not in list and couldnt be added (limit reached)
          return responseInvalid('hwid_mismatch');
        }
      } else {
        // no hwids stored yet, require hwid to be provided
        if (!hwid) {
          return responseInvalid('hwid_required');
        }
      }
    }
    
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
          hwidLimit: configuredLimit,
          hwids: updatedHwids,
          createdAt: refreshedLicense.createdAt,
          updatedAt: refreshedLicense.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error('Validate license error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'internal server error',
      },
      { status: 500 }
    );
  }
}

