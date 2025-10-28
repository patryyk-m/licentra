import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function POST(req, { params }) {
  const rateLimited = checkRateLimit(req, 60, 1);
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, message: 'invalid app id' }, { status: 400 });
    }

    await connectDB();
    const app = await App.findById(id);
    if (!app || app.status === 'suspended') {
      return NextResponse.json({ success: false, message: 'app not found' }, { status: 404 });
    }

    if (user.role !== 'admin' && app.ownerId.toString() !== user.id) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const plainSecret = crypto.randomBytes(48).toString('base64url');
    const apiSecretHash = await bcrypt.hash(plainSecret, 10);

    app.apiSecretHash = apiSecretHash;
    await app.save();

    return NextResponse.json({
      success: true,
      message: 'API secret reset',
      data: { apiSecret: plainSecret }, // return only once
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}


