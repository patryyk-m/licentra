import { notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import License from '@/models/License';
import App from '@/models/App';
import { AdminLicenseActions, AdminNotesPanel } from '@/app/admin/_components/admin-ui';

export const dynamic = 'force-dynamic';

export default async function AdminLicenseDetailPage({ params }) {
  const { id } = await params;
  await connectDB();

  const license = await License.findById(id).lean();
  if (!license) notFound();

  const app = license.appId ? await App.findById(license.appId).select('name').lean() : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">license</h1>
        <p className="text-sm text-muted-foreground">license id: {license._id.toString()}</p>
      </div>
      <div className="rounded-lg border p-4 text-sm space-y-1">
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
      </div>
      <div className="rounded-lg border p-4">
        <div className="text-sm font-medium mb-2">actions</div>
        <AdminLicenseActions
          licenseId={license._id.toString()}
          status={license.status}
        />
      </div>
      <AdminNotesPanel targetType="license" targetId={license._id.toString()} />
    </div>
  );
}

