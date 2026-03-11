import { notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import App from '@/models/App';
import User from '@/models/User';
import License from '@/models/License';
import { AdminAppActions, AdminLicenseActions, AdminNotesPanel } from '@/app/admin/_components/admin-ui';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{app.name}</h1>
        <p className="text-muted-foreground mt-2">app id: {app._id.toString()}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div>status: {app.status}</div>
          <div>owner: {owner?.username || '-'} ({owner?.email || '-'})</div>
          <div>licenses: {licenseCount}</div>
          <div>created: {app.createdAt ? new Date(app.createdAt).toLocaleString() : '-'}</div>
        </CardContent>
      </Card>

      <AdminAppActions appId={app._id.toString()} status={app.status} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">licenses</CardTitle>
        </CardHeader>
        <CardContent>
          {licenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">no licenses in this app</p>
          ) : (
            <div className="space-y-3">
              {licenses.map((license) => (
                <div
                  key={license._id.toString()}
                  className="rounded-lg border p-4 flex items-start justify-between gap-4 bg-muted/30"
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
        </CardContent>
      </Card>

      <AdminNotesPanel targetType="app" targetId={app._id.toString()} />
    </div>
  );
}

