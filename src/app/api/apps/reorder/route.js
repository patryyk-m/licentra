import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';

export async function POST(req) {
  const rateLimited = checkRateLimit(req, 60, 1);
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const body = await req.json();
    const { order } = body || {};

    if (!Array.isArray(order)) {
      return NextResponse.json({ success: false, message: 'invalid order array' }, { status: 400 });
    }

    for (let i = 0; i < order.length; i++) {
      const appId = order[i];
      await App.findByIdAndUpdate(appId, { sortOrder: i });
    }

    return NextResponse.json({ success: true, message: 'sort order updated' });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}

