import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateUser } from '@/middleware/auth';
import License from '@/models/License';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { ROLE } from '@/lib/roles';
import { hasAppAccess } from '@/lib/authz';

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

    const developerAppIds = Array.isArray(user.developerApps) ? user.developerApps : [];
    const partnerAppIds = Array.isArray(user.partnerApps) ? user.partnerApps : [];
    const hasAccess = hasAppAccess(app, user);
    const isAdmin = user.role === ROLE.ADMIN;
    const isOwner = app.ownerId?.toString() === user.id;
    const isCollaborator = developerAppIds.some((appRef) => appRef?.toString() === app._id.toString());
    const isPartner = user.role === ROLE.PARTNER &&
      partnerAppIds.some((appRef) => appRef?.toString() === app._id.toString());

    if (!hasAccess) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const licenseQuery = { appId };

    if (isPartner && !isAdmin && !isOwner && !isCollaborator) {
      licenseQuery.createdBy = user.id;
    }

    const licenses = await License.find(licenseQuery).sort({ createdAt: -1 }).lean();

    const sanitized = licenses.map((l) => {
      return {
        id: l._id.toString(),
        key: l.key || '',
        note: l.note || '',
        hwids: Array.isArray(l.hwids) ? l.hwids : [],
        hwidLocked: l.hwidLocked === true,
        hwidLimit: l.hwidLimit ?? null,
        expiryDate: l.expiryDate || null,
        status: l.status,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        isExpired: l.expiryDate ? new Date(l.expiryDate) < new Date() : false,
      };
    });

    return NextResponse.json({ success: true, data: { licenses: sanitized } });
  } catch (error) {
    console.error('List licenses error:', error);
    return NextResponse.json(
      { success: false, message: 'internal server error' },
      { status: 500 }
    );
  }
}


