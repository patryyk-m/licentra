'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Info, ArrowRight, CheckCheck, Lock, Settings2, Shield } from 'lucide-react';
import { toast } from 'sonner';

const severityIcons = { info: Info, warning: AlertTriangle, critical: AlertTriangle };
const severityColors = { info: '', warning: 'text-amber-500', critical: 'text-red-500' };

export default function AppSecurityTab({ appId }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [lockingId, setLockingId] = useState(null);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const fetchData = useCallback(async () => {
    if (!appId) return;
    try {
      setError('');
      const params = new URLSearchParams({ appId });
      if (unreadOnly) params.set('unreadOnly', 'true');
      const res = await fetch(`/api/notifications?${params}`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data.notifications || []);
        setUnreadCount(json.data.unreadCount ?? 0);
      } else {
        setError(json.message || 'failed to load alerts');
      }
    } catch {
      setError('failed to load alerts');
    } finally {
      setIsLoading(false);
    }
  }, [appId, unreadOnly]);

  useEffect(() => {
    setIsLoading(true);
    fetchData();
  }, [fetchData]);

  const handleMarkRead = async (id) => {
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: true }),
      });
      if (res.ok) fetchData();
    } catch {
      toast.error('failed to mark read');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toast.success('all marked read');
        fetchData();
      } else {
        toast.error('failed to mark all read');
      }
    } catch {
      toast.error('failed to mark all read');
    }
  };

  const handleLockLicense = async (licenseId) => {
    if (!licenseId) return;
    setLockingId(licenseId);
    try {
      const res = await fetch(`/api/licenses/suspend/${licenseId}`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (json.success) {
        toast.success('license suspended');
        fetchData();
      } else {
        toast.error(json.message || 'failed to suspend');
      }
    } catch {
      toast.error('failed to suspend license');
    } finally {
      setLockingId(null);
    }
  };

  const getLicenseLink = (n) => {
    if (n.appId && n.licenseId) return `/apps/${n.appId}/licenses?rateLimit=${n.licenseId}`;
    if (n.appId) return `/apps/${n.appId}?tab=settings`;
    return '/apps';
  };

  const getAppSettingsLink = (n) => (n.appId ? `/apps/${n.appId}?tab=settings` : '/apps');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-[140px] bg-muted animate-pulse rounded" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Security alerts
            </CardTitle>
            <CardDescription>rate limit and security events for this app</CardDescription>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead} className="gap-2">
              <CheckCheck className="w-4 h-4" />
              mark all read
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-4 items-center">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="rounded"
              aria-label="unread only"
            />
            <span className="text-sm text-muted-foreground">unread only</span>
          </label>
        </div>

        {notifications.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>no alerts for this app</p>
            <p className="text-sm mt-1">rate limit and security events will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map((n) => {
              const Icon = severityIcons[n.severity] || Info;
              return (
                <div
                  key={n.id}
                  className={`rounded-lg border p-4 ${!n.isRead ? 'border-l-4 border-l-primary' : ''}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${severityColors[n.severity] || ''}`} />
                        <span className="font-medium">{n.title}</span>
                        {!n.isRead && (
                          <Badge variant="secondary" className="text-xs">new</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                      {n.metadata?.rateLimitedCount != null && (
                        <div className="mt-2 text-xs text-muted-foreground space-y-1">
                          <p>
                            {n.metadata.rateLimitedCount} rate-limited requests from {n.metadata.uniqueIpCount} IPs
                            {n.metadata.timeWindow && ` (${n.metadata.timeWindow})`}
                          </p>
                          {Array.isArray(n.metadata.topIps) && n.metadata.topIps.length > 0 && (
                            <p>top IPs: {n.metadata.topIps.map((i) => `${i.ip} (${i.count})`).join(', ')}</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {!n.isRead && (
                        <Button variant="ghost" size="sm" onClick={() => handleMarkRead(n.id)}>
                          mark read
                        </Button>
                      )}
                      <Button asChild variant="outline" size="sm">
                        <Link href={getLicenseLink(n)} className="flex items-center gap-1">
                          view license
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </Button>
                      {n.type === 'rate_limit' && n.appId && n.licenseId && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLockLicense(n.licenseId)}
                            disabled={lockingId === n.licenseId}
                            className="flex items-center gap-1"
                          >
                            <Lock className="w-3 h-3" />
                            {lockingId === n.licenseId ? 'suspending...' : 'suspend license'}
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <Link href={getAppSettingsLink(n)} className="flex items-center gap-1">
                              <Settings2 className="w-3 h-3" />
                              reduce limit
                            </Link>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
