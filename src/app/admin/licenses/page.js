import { connectDB } from '@/lib/db';
import License from '@/models/License';

export const dynamic = 'force-dynamic';

export default async function AdminLicensesPage() {
  await connectDB();
  const licenses = await License.find({})
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Licenses</h2>
        <p className="text-sm text-muted-foreground">latest licenses for investigation</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        {licenses.length === 0 ? (
          <div className="text-sm text-muted-foreground">no licenses found</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2">key</th>
                <th className="text-left py-2">status</th>
                <th className="text-left py-2">created</th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((license) => (
                <tr key={license._id.toString()} className="border-b last:border-0">
                  <td className="py-2">
                    <a href={`/admin/licenses/${license._id.toString()}`} className="underline">
                      {license.key}
                    </a>
                  </td>
                  <td className="py-2">{license.status}</td>
                  <td className="py-2">
                    {license.createdAt ? new Date(license.createdAt).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

