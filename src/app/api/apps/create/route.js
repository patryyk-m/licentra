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
    if (!user || !['developer', 'admin'].includes(user.role)) {
      return NextResponse.json(
        { success: false, message: 'Forbidden: insufficient permissions' },
        { status: 403 }
      );
    }

    await connectDB();
    const body = await req.json();
    const name = (body?.name || '').trim();
    const description = (body?.description || '').trim();

    if (name.length < 2 || name.length > 40) {
      return NextResponse.json(
        { success: false, message: 'name must be between 2 and 40 characters' },
        { status: 400 }
      );
    }

    const app = await App.create({
      name,
      description,
      ownerId: user.id,
      apiSecretHash: '',
      status: 'active',
    });

    return NextResponse.json({
      success: true,
      message: 'Application created',
      data: {
        app: {
          id: app._id.toString(),
          name: app.name,
          description: app.description,
          status: app.status,
          createdAt: app.createdAt,
          updatedAt: app.updatedAt,
        }
      },
    });
  } catch (error) {
    console.error('Create app error:', error);
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, message: 'an app with this name already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, message: `internal server error: ${error.message}` },
      { status: 500 }
    );
  }
}


