import { NextResponse } from 'next/server';
import { authenticateUser } from '@/middleware/auth';
import { normalizeRole } from '@/lib/roles';
import { connectDB } from '@/lib/db';
import User from '@/models/User';
import App from '@/models/App';
import License from '@/models/License';
import AppInvite from '@/models/AppInvite';
import { clearAuthCookies } from '@/lib/cookies';

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

export async function DELETE(req) {
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

    await connectDB();

    const ownedAppCount = await App.countDocuments({ ownerId: user.id });
    if (ownedAppCount > 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'transfer or delete your applications before removing this account',
        },
        { status: 409 }
      );
    }

    await License.updateMany(
      { createdBy: user.id },
      { $set: { createdBy: null } }
    );

    await AppInvite.updateMany(
      { createdBy: user.id },
      { $set: { createdBy: null } }
    );

    await AppInvite.updateMany(
      { redeemedBy: user.id },
      { $unset: { redeemedBy: '' } }
    );

    await User.deleteOne({ _id: user.id });

    const response = NextResponse.json({
      success: true,
      message: 'account deleted',
    });
    clearAuthCookies(response);

    return response;
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

