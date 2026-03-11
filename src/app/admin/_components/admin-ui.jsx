'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

async function ensureStepUp() {
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

export function AdminNotesPanel({ targetType, targetId }) {
  const [notes, setNotes] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadNotes = async () => {
    const params = new URLSearchParams({ targetType, targetId });
    const res = await fetch(`/api/admin/notes?${params.toString()}`, { credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success) {
      setNotes(json.data?.notes || []);
    }
  };

  useEffect(() => {
    loadNotes();
  }, [targetType, targetId]);

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      const password = window.prompt('confirm password to add admin note');
      if (!password) return;

      const step = await fetch('/api/auth/step-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      const stepJson = await step.json().catch(() => ({}));
      if (!step.ok || !stepJson.success) {
        setMessage(stepJson.message || 'step-up failed');
        return;
      }

      const res = await fetch('/api/admin/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetType, targetId, note: note.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setMessage(json.message || 'failed to add note');
        return;
      }
      setNote('');
      await loadNotes();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">admin notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">no notes yet</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="rounded-lg border p-3 text-sm">
                <p>{n.note}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {n.createdAt ? new Date(n.createdAt).toLocaleString() : '-'}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="add note..."
            className="flex-1"
          />
          <Button variant="outline" size="sm" onClick={addNote} disabled={busy}>
            add
          </Button>
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}

export function AdminAppActions({ appId, status }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const run = async (fn) => {
    setBusy(true);
    setMessage('');
    try {
      const step = await ensureStepUp();
      if (!step.ok) {
        setMessage(step.message);
        return;
      }
      await fn();
      window.location.reload();
    } catch (e) {
      setMessage(e?.message || 'action failed');
    } finally {
      setBusy(false);
    }
  };

  const suspendApp = () =>
    run(async () => {
      const res = await fetch(`/api/admin/apps/${appId}/suspend`, { method: 'POST', credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'failed to suspend app');
    });

  const restoreApp = () =>
    run(async () => {
      const res = await fetch(`/api/admin/apps/${appId}/restore`, { method: 'POST', credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'failed to restore app');
    });

  const suspendAllLicenses = () =>
    run(async () => {
      const res = await fetch(`/api/admin/apps/${appId}/licenses/suspend-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirm: 'SUSPEND_ALL' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'failed to suspend licenses');
    });

  const rotateSecret = () =>
    run(async () => {
      const res = await fetch(`/api/admin/apps/${appId}/reset-secret`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'failed to rotate secret');
      const secret = json?.data?.apiSecret;
      if (secret) {
        window.alert(`new api secret (shown once): ${secret}`);
      }
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          {status === 'suspended' ? (
            <Button variant="outline" size="sm" onClick={restoreApp} disabled={busy}>
              restore app
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={suspendApp} disabled={busy}>
              suspend app
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={suspendAllLicenses} disabled={busy}>
            suspend all licenses
          </Button>
          <Button variant="outline" size="sm" onClick={rotateSecret} disabled={busy}>
            rotate app secret
          </Button>
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}

export function AdminUserActions({ userId, status, isSelf }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const run = async (endpoint) => {
    if (isSelf) {
      setMessage('cannot suspend your own account');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const step = await ensureStepUp();
      if (!step.ok) {
        setMessage(step.message);
        return;
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'action failed');
      window.location.reload();
    } catch (e) {
      setMessage(e?.message || 'action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          {status === 'suspended' ? (
            <Button variant="outline" size="sm" onClick={() => run(`/api/admin/users/${userId}/unsuspend`)} disabled={busy}>
              unsuspend user
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => run(`/api/admin/users/${userId}/suspend`)} disabled={busy}>
              suspend user
            </Button>
          )}
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}

export function AdminLicenseActions({ licenseId, status }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const run = async (fn) => {
    setBusy(true);
    setMessage('');
    try {
      const step = await ensureStepUp();
      if (!step.ok) {
        setMessage(step.message);
        return;
      }
      await fn();
      window.location.reload();
    } catch (e) {
      setMessage(e?.message || 'action failed');
    } finally {
      setBusy(false);
    }
  };

  const suspend = () =>
    run(async () => {
      const res = await fetch(`/api/admin/licenses/${licenseId}/suspend`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'failed to suspend');
    });

  const reactivate = () =>
    run(async () => {
      const res = await fetch(`/api/admin/licenses/${licenseId}/reactivate`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'failed to reactivate');
    });

  const remove = () =>
    run(async () => {
      const res = await fetch(`/api/admin/licenses/${licenseId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'failed to delete');
    });

  return (
    <div className="space-y-1">
      <div className="flex gap-2 flex-wrap">
        {status === 'suspended' ? (
          <Button variant="outline" size="sm" onClick={reactivate} disabled={busy}>
            reactivate
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={suspend} disabled={busy}>
            suspend
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={remove} disabled={busy}>
          delete
        </Button>
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

export function AdminUserPlanQuota({
  userId,
  initialPlan,
  initialMonthlyQuotaOverride,
  effectiveQuota,
  currentMonthUsage,
}) {
  const [plan, setPlan] = useState(initialPlan || 'free');
  const [override, setOverride] = useState(
    initialMonthlyQuotaOverride != null ? String(initialMonthlyQuotaOverride) : ''
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const run = async (fn) => {
    setBusy(true);
    setMessage('');
    try {
      const step = await ensureStepUp();
      if (!step.ok) {
        setMessage(step.message);
        return;
      }
      await fn();
      window.location.reload();
    } catch (e) {
      setMessage(e?.message || 'action failed');
    } finally {
      setBusy(false);
    }
  };

  const savePlanAndQuota = () =>
    run(async () => {
      const body = {};
      if (plan !== initialPlan) body.plan = plan;
      if (override !== (initialMonthlyQuotaOverride != null ? String(initialMonthlyQuotaOverride) : '')) {
        body.monthlyQuotaOverride = override === '' || override === 'clear' ? null : parseInt(override, 10);
        if (body.monthlyQuotaOverride !== null && (Number.isNaN(body.monthlyQuotaOverride) || body.monthlyQuotaOverride < 0)) {
          setMessage('quota override must be a non-negative number');
          return;
        }
      }
      if (Object.keys(body).length === 0) {
        setMessage('no changes to save');
        return;
      }
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'failed to update');
    });

  const resetQuota = () =>
    run(async () => {
      const res = await fetch(`/api/admin/users/${userId}/reset-quota`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'failed to reset quota');
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">plan and quota</CardTitle>
        <CardDescription>
          quota is always based on the app owner (creator). this user&apos;s plan and optional override set their effective monthly api limit. reset quota clears current month usage for this user.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-sm">
          <div>effective quota this month: {effectiveQuota == null ? '-' : effectiveQuota.toLocaleString()}</div>
          <div>current month usage: {currentMonthUsage == null ? '-' : currentMonthUsage.toLocaleString()}</div>
        </div>
        <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-2">
          <Label htmlFor="admin-plan">plan</Label>
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger id="admin-plan" className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">free</SelectItem>
              <SelectItem value="pro">pro</SelectItem>
              <SelectItem value="business">business</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-override">quota override</Label>
          <Input
            id="admin-override"
            type="number"
            min={0}
            placeholder="use plan default"
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            className="w-[140px]"
          />
          <p className="text-xs text-muted-foreground">leave empty for plan default</p>
        </div>
        <Button onClick={savePlanAndQuota} disabled={busy} variant="default">
          {busy ? 'saving...' : 'save plan / override'}
        </Button>
        <Button onClick={resetQuota} disabled={busy} variant="outline">
          {busy ? '...' : 'reset quota (current month)'}
        </Button>
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
