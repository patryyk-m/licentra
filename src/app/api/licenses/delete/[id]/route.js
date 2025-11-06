import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import License from '@/models/License';
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
      return NextResponse.json({ success: false, message: 'invalid license id' }, { status: 400 });
    }

    await connectDB();
    const license = await License.findById(id).populate('appId');
    if (!license) {
      return NextResponse.json({ success: false, message: 'license not found' }, { status: 404 });
    }

    const app = license.appId;
    if (user.role !== 'admin' && app.ownerId.toString() !== user.id) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    await License.deleteOne({ _id: id });

    return NextResponse.json({ success: true, message: 'license deleted' });
  } catch (error) {
    console.error('Delete license error:', error);
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}

