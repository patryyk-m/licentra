import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { checkRateLimit } from '@/lib/ratelimit';
import App from '@/models/App';
import License from '@/models/License';
import { verifyPassword } from '@/lib/crypto';
import mongoose from 'mongoose';

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
    }).lean();

    if (!license) {
      return responseInvalid('license_not_found');
    }

    if (license.status !== 'active') {
      return responseInvalid('license_not_active');
    }

    if (license.expiryDate && new Date(license.expiryDate) < new Date()) {
      return responseInvalid('license_expired');
    }

    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        license: {
          id: license._id.toString(),
          key: license.key,
          note: license.note,
          status: license.status,
          expiryDate: license.expiryDate,
          hwidLocked: license.hwidLocked,
          hwid: license.hwid,
          createdAt: license.createdAt,
          updatedAt: license.updatedAt,
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

