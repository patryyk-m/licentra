import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import License from '@/models/License';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';

export async function GET(req) {
  const rateLimited = checkRateLimit(req, 60, 1);
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const appId = searchParams.get('appId');

    if (!appId) {
      return NextResponse.json({ success: false, message: 'appId required' }, { status: 400 });
    }

    const app = await App.findById(appId);
    if (!app || app.status === 'suspended') {
      return NextResponse.json({ success: false, message: 'app not found' }, { status: 404 });
    }

    if (user.role !== 'admin' && app.ownerId.toString() !== user.id) {
      if (user.role !== 'redistributor') {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
    }

    const licenses = await License.find({ appId }).sort({ createdAt: -1 }).lean();

    const sanitized = licenses.map((l) => ({
      id: l._id.toString(),
      key: l.key || '',
      note: l.note || '',
      hwid: l.hwid || null,
      hwidLocked: l.hwidLocked === true,
      expiryDate: l.expiryDate || null,
      status: l.status,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      isExpired: l.expiryDate ? new Date(l.expiryDate) < new Date() : false,
    }));

    return NextResponse.json({ success: true, data: { licenses: sanitized } });
  } catch (error) {
    console.error('List licenses error:', error);
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}


