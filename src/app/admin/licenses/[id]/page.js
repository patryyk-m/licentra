import { notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import License from '@/models/License';
import App from '@/models/App';
import { AdminLicenseActions, AdminNotesPanel } from '@/app/admin/_components/admin-ui';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AdminLicenseDetailPage({ params }) {
  const { id } = await params;
  await connectDB();

  const license = await License.findById(id).lean();
  if (!license) notFound();

  const app = license.appId ? await App.findById(license.appId).select('name').lean() : null;

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">license</h1>
        <p className="text-muted-foreground mt-2">license id: {license._id.toString()}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div>key: {license.key}</div>
          <div>status: {license.status}</div>
          <div>
            app:{' '}
            {license.appId ? (
              <a href={`/admin/apps/${license.appId.toString()}`} className="underline">
                {app?.name || license.appId.toString()}
              </a>
            ) : (
              '-'
            )}
          </div>
          <div>created: {license.createdAt ? new Date(license.createdAt).toLocaleString() : '-'}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">actions</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminLicenseActions
            licenseId={license._id.toString()}
            status={license.status}
          />
        </CardContent>
      </Card>
      <AdminNotesPanel targetType="license" targetId={license._id.toString()} />
    </div>
  );
}

