import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import License from '@/models/License';
import App from '@/models/App';
import { sanitizeObjectId } from '@/lib/security';
import { withAdmin, fail, wrapRoute } from '@/lib/http';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export async function GET(req) {
  try {
    const requireAdmin = withAdmin(async (_req, user) => ({ user }), {
      forbiddenMessage: 'forbidden',
      forbiddenStatus: 403,
    });
    const guardResult = await requireAdmin(req);
    if (guardResult instanceof NextResponse) return guardResult;

    await connectDB();

    const url = new URL(req.url);
    const appId = url.searchParams.get('appId');
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);

    const filter = {};
    if (appId) {
      const parsed = sanitizeObjectId(appId);
      if (!parsed) return fail('invalid app id', 400);
      filter.appId = parsed;
    }

    const total = await License.countDocuments(filter);
    const licenses = await License.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();

    const appIds = [...new Set(licenses.map((l) => l.appId?.toString()).filter(Boolean))];
    const apps = await App.find({ _id: { $in: appIds } }).select('name').lean();
    const appMap = new Map(apps.map((a) => [a._id.toString(), a.name]));

    return NextResponse.json({
      success: true,
      data: {
        licenses: licenses.map((l) => ({
          id: l._id.toString(),
          key: l.key,
          appId: l.appId?.toString(),
          appName: appMap.get(l.appId?.toString()) || null,
          status: l.status,
          note: l.note,
          expiresAt: l.expiresAt,
          createdAt: l.createdAt,
        })),
        pagination: {
          page,
          pageSize: PAGE_SIZE,
          total,
        },
      },
    });
  } catch (error) {
    console.error('admin licenses error', error);
    return NextResponse.json(
      { success: false, message: 'failed to load licenses' },
      { status: 500 }
    );
  }
}
