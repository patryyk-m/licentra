import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import App from '@/models/App';
import User from '@/models/User';
import License from '@/models/License';
import { withAdmin } from '@/lib/http';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get('q')?.trim().toLowerCase() || '';
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);

    const requireAdmin = withAdmin(async (_req, user) => ({ user }), {
      forbiddenMessage: 'forbidden',
      forbiddenStatus: 403,
    });
    const guardResult = await requireAdmin(req);
    if (guardResult instanceof NextResponse) return guardResult;

    await connectDB();

    const filter = {};
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    const total = await App.countDocuments(filter);
    const apps = await App.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();

    const appIds = apps.map((a) => a._id);
    const licenseStats = appIds.length
      ? await License.aggregate([
          { $match: { appId: { $in: appIds } } },
          {
            $group: {
              _id: '$appId',
              count: { $sum: 1 },
            },
          },
        ])
      : [];
    const licenseMap = new Map(
      licenseStats.map((s) => [s._id.toString(), { count: s.count || 0 }])
    );

    const ownerIds = [...new Set(apps.map((a) => a.ownerId?.toString()).filter(Boolean))];
    const owners = ownerIds.length
      ? await User.find({ _id: { $in: ownerIds } })
          .select('username email')
          .lean()
      : [];
    const ownerMap = new Map(owners.map((o) => [o._id.toString(), o]));

    return NextResponse.json({
      success: true,
      data: {
        apps: apps.map((app) => {
          const owner = app.ownerId ? ownerMap.get(app.ownerId.toString()) : null;
          return {
            id: app._id.toString(),
            name: app.name,
            status: app.status,
            ownerId: app.ownerId?.toString() || null,
            ownerUsername: owner?.username || null,
            ownerEmail: owner?.email || null,
            licenseCount: licenseMap.get(app._id.toString())?.count || 0,
            createdAt: app.createdAt,
          };
        }),
        pagination: {
          page,
          pageSize: PAGE_SIZE,
          total,
        },
      },
    });
  } catch (error) {
    console.error('admin apps error', error);
    return NextResponse.json(
      { success: false, message: 'failed to load apps' },
      { status: 500 }
    );
  }
}

