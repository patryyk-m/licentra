'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    <div className="rounded-lg border p-4 space-y-3">
      <div className="text-sm font-medium">admin notes</div>
      <div className="space-y-2">
        {notes.length === 0 ? (
          <div className="text-xs text-muted-foreground">no notes yet</div>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="text-xs border rounded p-2 bg-background">
              <div>{n.note}</div>
              <div className="text-muted-foreground mt-1">
                {n.createdAt ? new Date(n.createdAt).toLocaleString() : '-'}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="add note..."
          className="border rounded px-2 py-1 text-sm flex-1 bg-background"
        />
        <button
          onClick={addNote}
          disabled={busy}
          className="px-3 py-1 rounded border text-sm bg-background hover:bg-muted"
        >
          add
        </button>
      </div>
      {message ? <div className="text-xs text-muted-foreground">{message}</div> : null}
    </div>
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
    <div className="rounded-lg border p-4 space-y-2">
      <div className="text-sm font-medium">actions</div>
      <div className="flex gap-2 flex-wrap">
        {status === 'suspended' ? (
          <button
            onClick={restoreApp}
            disabled={busy}
            className="px-3 py-1 text-sm rounded border bg-background hover:bg-muted"
          >
            restore app
          </button>
        ) : (
          <button
            onClick={suspendApp}
            disabled={busy}
            className="px-3 py-1 text-sm rounded border bg-background hover:bg-muted"
          >
            suspend app
          </button>
        )}
        <button
          onClick={suspendAllLicenses}
          disabled={busy}
          className="px-3 py-1 text-sm rounded border bg-background hover:bg-muted"
        >
          suspend all licenses
        </button>
        <button
          onClick={rotateSecret}
          disabled={busy}
          className="px-3 py-1 text-sm rounded border bg-background hover:bg-muted"
        >
          rotate app secret
        </button>
      </div>
      {message ? <div className="text-xs text-muted-foreground">{message}</div> : null}
    </div>
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
    <div className="rounded-lg border p-4 space-y-2">
      <div className="text-sm font-medium">actions</div>
      <div className="flex gap-2 flex-wrap">
        {status === 'suspended' ? (
          <button
            onClick={() => run(`/api/admin/users/${userId}/unsuspend`)}
            disabled={busy}
            className="px-3 py-1 text-sm rounded border bg-background hover:bg-muted"
          >
            unsuspend user
          </button>
        ) : (
          <button
            onClick={() => run(`/api/admin/users/${userId}/suspend`)}
            disabled={busy}
            className="px-3 py-1 text-sm rounded border bg-background hover:bg-muted"
          >
            suspend user
          </button>
        )}
      </div>
      {message ? <div className="text-xs text-muted-foreground">{message}</div> : null}
    </div>
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
          <button
            onClick={reactivate}
            disabled={busy}
            className="px-2 py-1 rounded border text-xs bg-background hover:bg-muted"
          >
            reactivate
          </button>
        ) : (
          <button
            onClick={suspend}
            disabled={busy}
            className="px-2 py-1 rounded border text-xs bg-background hover:bg-muted"
          >
            suspend
          </button>
        )}
        <button
          onClick={remove}
          disabled={busy}
          className="px-2 py-1 rounded border text-xs bg-background hover:bg-muted"
        >
          delete
        </button>
      </div>
      {message ? <div className="text-[11px] text-muted-foreground">{message}</div> : null}
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
    <div className="rounded-lg border p-4 space-y-4">
      <div className="text-sm font-medium">plan and quota</div>
      <p className="text-xs text-muted-foreground">
        quota is always based on the app owner (creator). this user&apos;s plan and optional override set their effective monthly api limit. reset quota clears current month usage for this user.
      </p>
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
      {message ? <div className="text-xs text-muted-foreground">{message}</div> : null}
    </div>
  );
}
