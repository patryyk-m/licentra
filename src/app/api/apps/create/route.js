import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import { handleApiError } from '@/lib/errors';
import { sanitizeForDb } from '@/lib/sanitize';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAppRateLimit } from '@/config/ratelimits';

export async function POST(req) {
  const rateLimited = checkRateLimit(req, getAppRateLimit('create'));
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
    const rawName = (body?.name || '').trim();
    const rawDesc = (body?.description || '').trim();
    const name = sanitizeForDb(rawName, 40);
    const description = sanitizeForDb(rawDesc, 500) ?? '';

    if (!name || name.length < 2) {
      return NextResponse.json(
        { success: false, message: 'name must be between 2 and 40 characters' },
        { status: 400 }
      );
    }

    const app = await App.create({
      name,
      description: description || '',
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
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, message: 'an app with this name already exists' },
        { status: 409 }
      );
    }
    return handleApiError(error, 'apps_create');
  }
}


