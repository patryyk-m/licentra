'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

async function stepUp() {
  const password = window.prompt('confirm password for this admin action');
  if (!password) return { ok: false, message: 'cancelled' };
  const res = await fetch('/api/auth/step-up', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    return { ok: false, message: json.message || 'step-up failed' };
  }
  return { ok: true };
}

export function BlockedIpsPanel({ initialRows }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows || []);
  const [ip, setIp] = useState('');
  const [blockedHours, setBlockedHours] = useState('168');
  const [permanent, setPermanent] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setRows(initialRows || []);
  }, [initialRows]);

  const addBlock = async (e) => {
    e.preventDefault();
    const trimmed = ip.trim();
    if (!trimmed) return;
    setBusy(true);
    setMessage('');
    try {
      const s = await stepUp();
      if (!s.ok) {
        setMessage(s.message || 'cancelled');
        return;
      }
      const res = await fetch('/api/admin/blocked-ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ip: trimmed,
          permanent,
          blockedHours:
            permanent || blockedHours === '' ? undefined : parseInt(blockedHours, 10),
          reason: reason.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setMessage(json.message || 'failed to block ip');
        return;
      }
      setIp('');
      setReason('');
      setPermanent(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const makePermanent = async (ipValue) => {
    setBusy(true);
    setMessage('');
    try {
      const s = await stepUp();
      if (!s.ok) {
        setMessage(s.message || 'cancelled');
        return;
      }
      const res = await fetch('/api/admin/blocked-ips', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ip: ipValue }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setMessage(json.message || 'failed to update block');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const unban = async (ipValue) => {
    setBusy(true);
    setMessage('');
    try {
      const s = await stepUp();
      if (!s.ok) {
        setMessage(s.message || 'cancelled');
        return;
      }
      const res = await fetch(`/api/admin/blocked-ips?ip=${encodeURIComponent(ipValue)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setMessage(json.message || 'failed to unblock');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>block an ip</CardTitle>
          <CardDescription>
            blocks license validation only (fast reject before heavy work). timed blocks expire automatically; permanent
            stays until you unblock.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={addBlock} className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label htmlFor="block-ip">ip address</Label>
              <Input
                id="block-ip"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="203.0.113.42"
                disabled={busy}
                autoComplete="off"
              />
            </div>
            <div className="flex items-center gap-2 pt-8 sm:pt-0 sm:items-end">
              <Checkbox
                id="block-permanent"
                checked={permanent}
                onCheckedChange={(v) => setPermanent(v === true)}
                disabled={busy}
              />
              <Label htmlFor="block-permanent" className="text-sm font-normal cursor-pointer">
                permanent
              </Label>
            </div>
            <div className="space-y-2 w-[120px]">
              <Label htmlFor="block-hours">hours</Label>
              <Input
                id="block-hours"
                type="number"
                min={1}
                max={8760}
                value={blockedHours}
                onChange={(e) => setBlockedHours(e.target.value)}
                disabled={busy || permanent}
              />
            </div>
            <div className="space-y-2 flex-1 min-w-[160px]">
              <Label htmlFor="block-reason">reason (optional)</Label>
              <Input
                id="block-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="spam"
                disabled={busy}
                maxLength={120}
              />
            </div>
            <Button type="submit" disabled={busy}>
              block
            </Button>
          </form>
        </CardContent>
      </Card>

      {message ? <p className="text-sm text-destructive">{message}</p> : null}

      <Card>
        <CardContent className="p-4">
          {rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">no active ip blocks</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2 pr-4">ip</th>
                  <th className="text-left py-2 pr-4">until</th>
                  <th className="text-left py-2 pr-4">reason</th>
                  <th className="text-right py-2">actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{row.ip}</td>
                    <td className="py-2 text-xs">
                      {row.permanent ? (
                        <span className="text-destructive font-medium">permanent</span>
                      ) : row.blockedUntil ? (
                        new Date(row.blockedUntil).toLocaleString()
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-2 text-xs">{row.reason || '-'}</td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {!row.permanent ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => makePermanent(row.ip)}
                          >
                            make permanent
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => unban(row.ip)}
                        >
                          unblock
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
