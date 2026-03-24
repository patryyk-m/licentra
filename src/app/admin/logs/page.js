import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

async function fetchLogs({ event = '', userId = '', targetType = '', targetId = '', page = 1 }) {
  const params = new URLSearchParams();
  if (event) params.set('event', event);
  if (userId) params.set('userId', userId);
  if (targetType) params.set('targetType', targetType);
  if (targetId) params.set('targetId', targetId);
  params.set('page', String(page));

  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || 'http';
  const baseUrl = `${proto}://${host}`;
  const cookie = h.get('cookie') || '';

  const res = await fetch(`${baseUrl}/api/admin/logs?${params.toString()}`, {
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
    throw new Error(json.message || 'failed to load logs');
  }
  return json.data;
}

export default async function AdminLogsPage(props) {
  const sp = await props.searchParams;
  const event = typeof sp?.event === 'string' ? sp.event : '';
  const userId = typeof sp?.userId === 'string' ? sp.userId : '';
  const targetType = typeof sp?.targetType === 'string' ? sp.targetType : '';
  const targetId = typeof sp?.targetId === 'string' ? sp.targetId : '';
  const page = sp?.page ? parseInt(sp.page, 10) || 1 : 1;

  const data = await fetchLogs({ event, userId, targetType, targetId, page });
  if (data?.unauthorized) {
    redirect('/login');
  }
  const totalPages = Math.max(
    1,
    Math.ceil((data.pagination?.total || 0) / (data.pagination?.pageSize || 50))
  );

  return (
    <div className="space-y-6">
      <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Security logs</h1>
        </div>
        <form className="flex gap-2 items-center flex-wrap" action="/admin/logs" method="get">
          <Input
            type="text"
            name="event"
            defaultValue={event}
            placeholder="event (optional)"
            className="w-[140px]"
          />
          <Input
            type="text"
            name="userId"
            defaultValue={userId}
            placeholder="user id (optional)"
            className="w-[140px]"
          />
          <Input
            type="text"
            name="targetType"
            defaultValue={targetType}
            placeholder="target type (optional)"
            className="w-[140px]"
          />
          <Input
            type="text"
            name="targetId"
            defaultValue={targetId}
            placeholder="target id (optional)"
            className="w-[140px]"
          />
          <Button type="submit">filter</Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-4">
        {data.logs.length === 0 ? (
          <div className="text-sm text-muted-foreground">no logs found</div>
        ) : (
          <>
            <table className="w-full text-xs">
              <thead className="text-[11px] text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-1">time</th>
                  <th className="text-left py-1">event</th>
                  <th className="text-left py-1">user</th>
                  <th className="text-left py-1">ip</th>
                  <th className="text-left py-1">resource</th>
                  <th className="text-left py-1">reason</th>
                  <th className="text-left py-1">target</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0">
                    <td className="py-1">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : '-'}
                    </td>
                    <td className="py-1">{log.event}</td>
                    <td className="py-1">{log.userId || '-'}</td>
                  <td className="py-1">{log.ip}</td>
                  <td className="py-1">
                    {log.resource || (log.targetType && log.targetId ? `${log.targetType}:${log.targetId}` : '-')}
                  </td>
                  <td className="py-1">{log.reason}</td>
                  <td className="py-1">
                    {log.targetType && log.targetId ? (
                      log.targetType === 'app' ? (
                        <a href={`/admin/apps/${log.targetId}`} className="underline">
                          app {log.targetId}
                        </a>
                      ) : log.targetType === 'user' ? (
                        <a href={`/admin/users/${log.targetId}`} className="underline">
                          user {log.targetId}
                        </a>
                      ) : log.targetType === 'license' ? (
                        <a href={`/admin/licenses/${log.targetId}`} className="underline">
                          license {log.targetId}
                        </a>
                      ) : `${log.targetType} ${log.targetId}`
                    ) : (
                      '-'
                    )}
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
                    href={`/admin/logs?${new URLSearchParams({
                      ...(event ? { event } : {}),
                      ...(userId ? { userId } : {}),
                      ...(targetType ? { targetType } : {}),
                      ...(targetId ? { targetId } : {}),
                      page: String(Math.max(1, page - 1)),
                    }).toString()}`}
                    className="px-2 py-1 rounded border hover:bg-muted disabled:opacity-50"
                    aria-disabled={page <= 1}
                  >
                    prev
                  </a>
                  <a
                    href={`/admin/logs?${new URLSearchParams({
                      ...(event ? { event } : {}),
                      ...(userId ? { userId } : {}),
                      ...(targetType ? { targetType } : {}),
                      ...(targetId ? { targetId } : {}),
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

