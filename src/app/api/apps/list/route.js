import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { authenticateUser } from '@/middleware/auth';
import App from '@/models/App';
import { checkRateLimit } from '@/lib/ratelimit';
import { getAppRateLimit } from '@/config/ratelimits';
import { normalizeRole, ROLE } from '@/lib/roles';

export async function GET(req) {
  const rateLimited = checkRateLimit(req, getAppRateLimit('list'));
  if (rateLimited) return rateLimited;

  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const collaboratorIds = Array.isArray(user.developerApps) ? user.developerApps : [];
    const partnerAppIds = Array.isArray(user.partnerApps) ? user.partnerApps : [];
    const normalizedRole = normalizeRole(user.role);
    let query = { ownerId: user.id, status: { $ne: 'suspended' } };

    if (normalizedRole === ROLE.ADMIN) {
      query = { status: { $ne: 'suspended' } };
    } else if (normalizedRole === ROLE.PARTNER) {
      if (partnerAppIds.length === 0) {
        return NextResponse.json({ success: true, data: { apps: [] } });
      }

      query = { _id: { $in: partnerAppIds }, status: { $ne: 'suspended' } };
    } else if (normalizedRole === ROLE.DEVELOPER && collaboratorIds.length > 0) {
      query = {
        status: { $ne: 'suspended' },
        $or: [
          { ownerId: user.id },
          { _id: { $in: collaboratorIds } },
        ],
      };
    }
    const apps = await App.find(query)
      .select('+apiSecretHash')
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    const collaboratorSet = new Set(collaboratorIds.map((id) => id.toString()));

    const sanitized = apps.map((a) => {
      const idString = a._id.toString();
      return {
        id: idString,
        name: a.name,
        description: a.description || '',
        status: a.status,
        sortOrder: a.sortOrder || 0,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        hasApiSecret: !!a.apiSecretHash,
        validationsPerMinutePerLicense: a.validationsPerMinutePerLicense ?? 10,
        autoSuspendOnRateLimitAbuse: a.autoSuspendOnRateLimitAbuse ?? false,
        ownerId: a.ownerId?.toString?.() || '',
        accessLevel: normalizedRole === ROLE.ADMIN
          ? 'admin'
          : a.ownerId?.toString?.() === user.id
            ? 'owner'
            : collaboratorSet.has(idString)
              ? 'collaborator'
              : normalizedRole === ROLE.PARTNER
                ? 'partner'
                : 'none',
      };
    });

    return NextResponse.json({ success: true, data: { apps: sanitized } });
  } catch (error) {
    return handleApiError(error, 'apps_list');
  }
}


