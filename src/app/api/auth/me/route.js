import { NextResponse } from 'next/server';
import { authenticateUser } from '@/middleware/auth';
import { normalizeRole } from '@/lib/roles';

export async function GET(req) {
  try {
    const user = await authenticateUser(req);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: normalizeRole(user.role),
          plan: user.plan || 'free',
          partnerApps: Array.isArray(user.partnerApps)
            ? user.partnerApps.map((appId) => appId?.toString())
            : [],
          developerApps: Array.isArray(user.developerApps)
            ? user.developerApps.map((appId) => appId?.toString())
            : [],
        },
      },
    });
  } catch (error) {
    console.error('Me endpoint error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

