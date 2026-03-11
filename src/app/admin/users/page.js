import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

async function fetchUsers({ q = '', page = 1 }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('page', String(page));

  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || 'http';
  const baseUrl = `${proto}://${host}`;
  const cookie = h.get('cookie') || '';

  const res = await fetch(`${baseUrl}/api/admin/users?${params.toString()}`, {
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
    throw new Error(json.message || 'failed to load users');
  }
  return json.data;
}

export default async function AdminUsersPage(props) {
  const sp = await props.searchParams;
  const q = typeof sp?.q === 'string' ? sp.q : '';
  const page = sp?.page ? parseInt(sp.page, 10) || 1 : 1;

  const data = await fetchUsers({ q, page });
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
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground mt-2">
            search across all licentra accounts. dangerous actions require step up on the api routes.
          </p>
        </div>
        <form className="flex gap-2" action="/admin/users" method="get">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="search by email or username"
            className="border rounded-md px-2 py-1 text-sm bg-background"
          />
          <button
            type="submit"
            className="px-3 py-1 rounded-md text-sm border bg-primary text-primary-foreground"
          >
            search
          </button>
        </form>
      </div>

      <Card>
        <CardContent className="p-4">
        {data.users.length === 0 ? (
          <div className="text-sm text-muted-foreground">no users found</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2">email</th>
                  <th className="text-left py-2">username</th>
                  <th className="text-left py-2">status</th>
                  <th className="text-left py-2">role</th>
                  <th className="text-left py-2">plan</th>
                  <th className="text-left py-2">subscription</th>
                  <th className="text-left py-2">created</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2">
                      <a href={`/admin/users/${u.id}`} className="underline">
                        {u.email}
                      </a>
                    </td>
                    <td className="py-2">{u.username}</td>
                    <td className="py-2">{u.status}</td>
                    <td className="py-2">{u.role}</td>
                    <td className="py-2">{u.plan}</td>
                    <td className="py-2">
                      {u.subscriptionStatus || 'none'}
                      {u.cancelAtPeriodEnd ? ' (cancel at period end)' : ''}
                    </td>
                    <td className="py-2">
                      {u.createdAt ? new Date(u.createdAt).toLocaleString() : '-'}
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
                    href={`/admin/users?${new URLSearchParams({
                      ...(q ? { q } : {}),
                      page: String(Math.max(1, page - 1)),
                    }).toString()}`}
                    className="px-2 py-1 rounded border hover:bg-muted disabled:opacity-50"
                    aria-disabled={page <= 1}
                  >
                    prev
                  </a>
                  <a
                    href={`/admin/users?${new URLSearchParams({
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

