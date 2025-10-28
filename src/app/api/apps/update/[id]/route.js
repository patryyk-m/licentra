import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';

export async function PATCH(req, { params }) {
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

    const body = await req.json();
    const updates = {};
    if (typeof body?.name === 'string') {
      const nm = body.name.trim();
      if (nm.length < 2 || nm.length > 40) {
        return NextResponse.json({ success: false, message: 'name must be between 2 and 40 characters' }, { status: 400 });
      }
      updates.name = nm;
    }
    if (typeof body?.description === 'string') {
      updates.description = body.description.trim();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, message: 'no updates provided' }, { status: 400 });
    }

    Object.assign(app, updates);
    await app.save();

    return NextResponse.json({
      success: true,
      message: 'Application updated',
      data: {
        app: {
          id: app._id.toString(),
          name: app.name,
          description: app.description || '',
          status: app.status,
          createdAt: app.createdAt,
          updatedAt: app.updatedAt,
        },
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, message: 'an app with this name already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}


