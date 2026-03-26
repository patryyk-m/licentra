import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BlockedIpsPanel } from '@/app/admin/_components/blocked-ips-panel';

export const dynamic = 'force-dynamic';

async function fetchBlockedIps() {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || 'http';
  const baseUrl = `${proto}://${host}`;
  const cookie = h.get('cookie') || '';

  const res = await fetch(`${baseUrl}/api/admin/blocked-ips`, {
    cache: 'no-store',
    headers: { cookie },
  });
  if (res.status === 401 || res.status === 403) {
    return { unauthorized: true };
  }
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.message || 'failed to load blocked ips');
  }
  return json.data;
}

export default async function AdminBlockedIpsPage() {
  const data = await fetchBlockedIps();
  if (data?.unauthorized) {
    redirect('/login');
  }

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">blocked ips (validate)</h1>
      </div>
      <BlockedIpsPanel initialRows={data.blockedIps} />
    </div>
  );
}
