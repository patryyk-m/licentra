import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import SecurityLog from '@/models/SecurityLog';
import { withAdmin } from '@/lib/http';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const event = url.searchParams.get('event') || '';
    const userId = url.searchParams.get('userId') || '';
    const targetType = url.searchParams.get('targetType') || '';
    const targetId = url.searchParams.get('targetId') || '';
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);

    const requireAdmin = withAdmin(async (_req, user) => ({ user }), {
      forbiddenMessage: 'forbidden',
      forbiddenStatus: 403,
    });
    const guardResult = await requireAdmin(req);
    if (guardResult instanceof NextResponse) return guardResult;

    await connectDB();

    const filter = {};
    if (event) {
      filter.event = event;
    }
    if (userId) {
      filter.userId = userId;
    }
    if (targetType) {
      filter['details.targetType'] = targetType;
    }
    if (targetId) {
      filter['details.targetId'] = targetId;
    }

    const total = await SecurityLog.countDocuments(filter);
    const logs = await SecurityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();

    return NextResponse.json({
      success: true,
      data: {
        logs: logs.map((log) => ({
          id: log._id.toString(),
          userId: log.userId?.toString() || null,
          event: log.event,
          ip: log.ip,
          userAgent: log.userAgent,
          resource: log.resource || '',
          reason: log.reason || '',
          targetType: log.details?.targetType || null,
          targetId: log.details?.targetId || null,
          createdAt: log.createdAt,
        })),
        pagination: {
          page,
          pageSize: PAGE_SIZE,
          total,
        },
      },
    });
  } catch (error) {
    console.error('admin logs error', error);
    return NextResponse.json(
      { success: false, message: 'failed to load logs' },
      { status: 500 }
    );
  }
}

