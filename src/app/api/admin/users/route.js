import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import User from '@/models/User';
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
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .select('username email role plan status createdAt subscription.status subscription.cancelAtPeriodEnd')
      .lean();

    return NextResponse.json({
      success: true,
      data: {
        users: users.map((u) => ({
          id: u._id.toString(),
          username: u.username,
          email: u.email,
          role: u.role,
          plan: u.plan,
          status: u.status || 'active',
          createdAt: u.createdAt,
          subscriptionStatus: u.subscription?.status || null,
          cancelAtPeriodEnd: u.subscription?.cancelAtPeriodEnd || false,
        })),
        pagination: {
          page,
          pageSize: PAGE_SIZE,
          total,
        },
      },
    });
  } catch (error) {
    console.error('admin users error', error);
    return NextResponse.json(
      { success: false, message: 'failed to load users' },
      { status: 500 }
    );
  }
}

