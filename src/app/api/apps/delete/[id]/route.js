import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';

export async function DELETE(req, { params }) {
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
    if (!app) {
      return NextResponse.json({ success: false, message: 'app not found' }, { status: 404 });
    }

    if (user.role !== 'admin' && app.ownerId.toString() !== user.id) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    app.status = 'suspended';
    await app.save();

    return NextResponse.json({ success: true, message: 'Application suspended' });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}


