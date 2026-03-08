import { connectDB } from '@/lib/db';
import User from '@/models/User';
import App from '@/models/App';
import License from '@/models/License';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  await connectDB();

  const [totalUsers, totalApps, totalLicenses] = await Promise.all([
    User.countDocuments({}),
    App.countDocuments({}),
    License.countDocuments({}),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          high level metrics across the whole platform
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground mb-1">users</div>
          <div className="text-2xl font-bold">{totalUsers}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground mb-1">apps</div>
          <div className="text-2xl font-bold">{totalApps}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground mb-1">licenses</div>
          <div className="text-2xl font-bold">{totalLicenses}</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        dangerous admin actions
      </p>
    </div>
  );
}

