import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

async function fetchApps({ q = '', page = 1 }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('page', String(page));

  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || 'http';
  const baseUrl = `${proto}://${host}`;
  const cookie = h.get('cookie') || '';

  const res = await fetch(`${baseUrl}/api/admin/apps?${params.toString()}`, {
    cache: 'no-store',
    headers: {
      cookie,
    },
  });
  if (res.status === 401 || res.status === 403) {
    return { unauthorized: true };
  }
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.message || 'failed to load apps');
  }
  return json.data;
}

export default async function AdminAppsPage(props) {
  const sp = await props.searchParams;
  const q = typeof sp?.q === 'string' ? sp.q : '';
  const page = sp?.page ? parseInt(sp.page, 10) || 1 : 1;

  const data = await fetchApps({ q, page });
  if (data?.unauthorized) {
    redirect('/login');
  }
  const totalPages = Math.max(
    1,
    Math.ceil((data.pagination?.total || 0) / (data.pagination?.pageSize || 20))
  );

  return (
    <div className="space-y-6">
      <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Apps</h1>
        </div>
        <form className="flex gap-2" action="/admin/apps" method="get">
          <Input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="search by app name"
            className="w-[200px]"
          />
          <Button type="submit">search</Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-4">
        {data.apps.length === 0 ? (
          <div className="text-sm text-muted-foreground">no apps found</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2">name</th>
                  <th className="text-left py-2">status</th>
                  <th className="text-left py-2">licenses</th>
                  <th className="text-left py-2">owner</th>
                  <th className="text-left py-2">created</th>
                </tr>
              </thead>
              <tbody>
                {data.apps.map((app) => (
                  <tr key={app.id} className="border-b last:border-0">
                    <td className="py-2">
                      <a href={`/admin/apps/${app.id}`} className="underline">
                        {app.name}
                      </a>
                    </td>
                    <td className="py-2">{app.status}</td>
                    <td className="py-2">
                      {app.licenseCount ?? 0}
                    </td>
                    <td className="py-2">
                      {app.ownerUsername
                        ? `${app.ownerUsername} (${app.ownerEmail || ''})`
                        : 'unknown'}
                    </td>
                    <td className="py-2">
                      {app.createdAt ? new Date(app.createdAt).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-2 mt-4 text-xs text-muted-foreground">
                <span>
                  page {page} of {totalPages}
                </span>
                <div className="flex gap-1">
                  <a
                    href={`/admin/apps?${new URLSearchParams({
                      ...(q ? { q } : {}),
                      page: String(Math.max(1, page - 1)),
                    }).toString()}`}
                    className="px-2 py-1 rounded border hover:bg-muted disabled:opacity-50"
                    aria-disabled={page <= 1}
                  >
                    prev
                  </a>
                  <a
                    href={`/admin/apps?${new URLSearchParams({
                      ...(q ? { q } : {}),
                      page: String(Math.min(totalPages, page + 1)),
                    }).toString()}`}
                    className="px-2 py-1 rounded border hover:bg-muted disabled:opacity-50"
                    aria-disabled={page >= totalPages}
                  >
                    next
                  </a>
                </div>
              </div>
            )}
          </>
        )}
        </CardContent>
      </Card>
    </div>
  );
}

