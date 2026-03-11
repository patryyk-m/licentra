import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import User from '@/models/User';
import App from '@/models/App';
import License from '@/models/License';
import ApiUsage from '@/models/ApiUsage';
import { verifyAccessToken } from '@/lib/auth';
import { getEffectiveMonthlyQuota } from '@/lib/plan-limits';
import { AdminNotesPanel, AdminUserActions, AdminUserPlanQuota } from '@/app/admin/_components/admin-ui';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AdminUserDetailPage({ params }) {
  const { id } = await params;
  await connectDB();

  const user = await User.findById(id).lean();
  if (!user) notFound();

  const appCount = await App.countDocuments({ ownerId: user._id });
  const licenseCount = await License.countDocuments({ createdBy: user._id });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const usageAgg = await ApiUsage.aggregate([
    {
      $match: {
        userId: user._id,
        date: { $gte: monthStart, $lt: nextMonthStart },
        $or: [{ licenseId: null }, { licenseId: { $exists: false } }],
      },
    },
    { $group: { _id: null, total: { $sum: '$count' } } },
  ]);
  const currentMonthUsage = usageAgg?.[0]?.total ?? 0;
  const effectiveQuota = getEffectiveMonthlyQuota(user.plan, user.monthlyQuotaOverride);

  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value || '';
  let currentUserId = null;
  try {
    const decoded = verifyAccessToken(accessToken);
    currentUserId = decoded?.id || null;
  } catch {}

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{user.username}</h1>
        <p className="text-muted-foreground mt-2">user id: {user._id.toString()}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div>email: {user.email}</div>
          <div>status: {user.status || 'active'}</div>
          <div>role: {user.role}</div>
          <div>plan: {user.plan}</div>
          <div>owned apps: {appCount}</div>
          <div>created licenses: {licenseCount}</div>
          <div>created: {user.createdAt ? new Date(user.createdAt).toLocaleString() : '-'}</div>
        </CardContent>
      </Card>

      <AdminUserPlanQuota
        userId={user._id.toString()}
        initialPlan={user.plan || 'free'}
        initialMonthlyQuotaOverride={user.monthlyQuotaOverride ?? null}
        effectiveQuota={effectiveQuota}
        currentMonthUsage={currentMonthUsage}
      />

      <AdminUserActions
        userId={user._id.toString()}
        status={user.status || 'active'}
        isSelf={currentUserId === user._id.toString()}
      />
      <AdminNotesPanel targetType="user" targetId={user._id.toString()} />
    </div>
  );
}

