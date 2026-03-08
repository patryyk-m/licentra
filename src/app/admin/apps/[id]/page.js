import { notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import App from '@/models/App';
import User from '@/models/User';
import License from '@/models/License';
import { AdminAppActions, AdminLicenseActions, AdminNotesPanel } from '@/app/admin/_components/admin-ui';

export const dynamic = 'force-dynamic';

export default async function AdminAppDetailPage({ params }) {
  const { id } = await params;
  await connectDB();

  const app = await App.findById(id).lean();
  if (!app) notFound();

  const owner = app.ownerId ? await User.findById(app.ownerId).select('email username').lean() : null;
  const licenseCount = await License.countDocuments({ appId: app._id });
  const licenses = await License.find({ appId: app._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{app.name}</h1>
        <p className="text-sm text-muted-foreground">app id: {app._id.toString()}</p>
      </div>

      <div className="rounded-lg border p-4 text-sm space-y-1">
        <div>status: {app.status}</div>
        <div>owner: {owner?.username || '-'} ({owner?.email || '-'})</div>
        <div>licenses: {licenseCount}</div>
        <div>created: {app.createdAt ? new Date(app.createdAt).toLocaleString() : '-'}</div>
      </div>

      <AdminAppActions appId={app._id.toString()} status={app.status} />

      <div className="rounded-lg border p-4 space-y-3">
        <div className="text-sm font-medium">licenses</div>
        {licenses.length === 0 ? (
          <div className="text-xs text-muted-foreground">no licenses in this app</div>
        ) : (
          <div className="space-y-3">
            {licenses.map((license) => (
              <div
                key={license._id.toString()}
                className="rounded border p-3 flex items-start justify-between gap-4"
              >
                <div className="text-sm">
                  <a href={`/admin/licenses/${license._id.toString()}`} className="font-mono underline">
                    {license.key}
                  </a>
                  <div className="text-xs text-muted-foreground mt-1">
                    status: {license.status} | created:{' '}
                    {license.createdAt ? new Date(license.createdAt).toLocaleString() : '-'}
                  </div>
                </div>
                <AdminLicenseActions
                  licenseId={license._id.toString()}
                  status={license.status}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <AdminNotesPanel targetType="app" targetId={app._id.toString()} />
    </div>
  );
}

