import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
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

    const query = user.role === 'admin' ? { status: { $ne: 'suspended' } } : { ownerId: user.id, status: { $ne: 'suspended' } };
    const apps = await App.find(query).sort({ sortOrder: 1, createdAt: -1 }).lean();

    const sanitized = apps.map((a) => ({
      id: a._id.toString(),
      name: a.name,
      description: a.description || '',
      status: a.status,
      sortOrder: a.sortOrder || 0,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));

    return NextResponse.json({ success: true, data: { apps: sanitized } });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}


