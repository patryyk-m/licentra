'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Shield, Lock, Eye, Bell, Trash2, Download, LogOut, AlertTriangle } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('security');

  // Security state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isRevokingSessions, setIsRevokingSessions] = useState(false);

  // Privacy state
  const [isExporting, setIsExporting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Preferences state
  const [preferences, setPreferences] = useState({
    notifications: {
      loginAlerts: true,
      passwordChange: true,
      sessionRevoked: true,
    },
    privacy: {
      consentToProcessing: false,
      cookiePreferences: 'essential',
    },
  });
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);

  // Audit state
  const [auditLogs, setAuditLogs] = useState([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!json.success) {
        router.push('/login');
        return;
      }
      setUser(json.data.user);
    } catch (error) {
      router.push('/login');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const fetchPreferences = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/preferences', { credentials: 'include' });
      const json = await res.json();
      if (json.success && json.data.preferences) {
        setPreferences(json.data.preferences);
      }
    } catch (error) {
      console.error('Failed to fetch preferences:', error);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const res = await fetch('/api/settings/sessions', { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setSessions(json.data.sessions || []);
      }
    } catch (error) {
      toast.error('failed to load sessions');
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    setIsLoadingAudit(true);
    try {
      const res = await fetch('/api/settings/audit?limit=50', { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setAuditLogs(json.data.logs || []);
      }
    } catch (error) {
      toast.error('failed to load audit logs');
    } finally {
      setIsLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
    fetchPreferences();
  }, [fetchUser, fetchPreferences]);

  useEffect(() => {
    if (activeTab === 'security') {
      fetchSessions();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab, fetchSessions, fetchAuditLogs]);

  const handleChangePassword = async (e) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast.error('password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const json = await res.json();
      if (json.success) {
        toast.success('password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        fetchSessions();
      } else {
        toast.error(json.message || 'failed to change password');
      }
    } catch (error) {
      toast.error('network error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!confirm('this will log you out of all devices. continue?')) {
      return;
    }

    setIsRevokingSessions(true);
    try {
      const res = await fetch('/api/settings/sessions', {
        method: 'DELETE',
        credentials: 'include',
      });

      const json = await res.json();
      if (json.success) {
        toast.success('all sessions revoked. please log in again.');
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
        toast.error(json.message || 'failed to revoke sessions');
      }
    } catch (error) {
      toast.error('network error');
    } finally {
      setIsRevokingSessions(false);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/settings/export-data', { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        const dataStr = JSON.stringify(json.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `licentra-data-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('data exported successfully');
      } else {
        toast.error(json.message || 'failed to export data');
      }
    } catch (error) {
      toast.error('network error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      toast.error('password confirmation required');
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: deletePassword }),
      });

      const json = await res.json();
      if (json.success) {
        toast.success('account deleted');
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
        toast.error(json.message || 'failed to delete account');
      }
    } catch (error) {
      toast.error('network error');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setDeletePassword('');
    }
  };

  const handleUpdatePreferences = async () => {
    setIsSavingPreferences(true);
    try {
      const res = await fetch('/api/settings/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(preferences),
      });

      const json = await res.json();
      if (json.success) {
        toast.success('preferences updated');
      } else {
        toast.error(json.message || 'failed to update preferences');
      }
    } catch (error) {
      toast.error('network error');
    } finally {
      setIsSavingPreferences(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-2">manage your security, privacy, and preferences</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="security">
              <Shield className="w-4 h-4 mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="privacy">
              <Lock className="w-4 h-4 mr-2" />
              Privacy
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="w-4 h-4 mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="audit">
              <Eye className="w-4 h-4 mr-2" />
              Audit
            </TabsTrigger>
          </TabsList>

          <TabsContent value="security" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>update your password to keep your account secure</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">minimum 8 characters</p>
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={isChangingPassword}>
                    {isChangingPassword ? 'changing...' : 'change password'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Sessions</CardTitle>
                <CardDescription>manage your active sessions and devices</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingSessions ? (
                  <div className="text-muted-foreground">loading sessions...</div>
                ) : sessions.length === 0 ? (
                  <div className="text-muted-foreground">no sessions found</div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      {sessions.slice(0, 5).map((session) => (
                        <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex-1">
                            <div className="font-medium">{session.userAgent || 'unknown device'}</div>
                            <div className="text-sm text-muted-foreground">
                              {session.ip} • {new Date(session.timestamp).toLocaleString()}
                            </div>
                          </div>
                          {session.isCurrent && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">current</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="destructive"
                      onClick={handleRevokeAllSessions}
                      disabled={isRevokingSessions}
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      {isRevokingSessions ? 'revoking...' : 'revoke all sessions'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="privacy" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Data Export</CardTitle>
                <CardDescription>download a copy of your personal data (GDPR right to data portability)</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleExportData} disabled={isExporting} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  {isExporting ? 'exporting...' : 'export my data'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Privacy Preferences</CardTitle>
                <CardDescription>control how your data is processed</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Consent to Optional Processing</Label>
                    <p className="text-sm text-muted-foreground">allow optional data processing (default: off)</p>
                  </div>
                  <Checkbox
                    checked={preferences.privacy.consentToProcessing}
                    onCheckedChange={(checked) => {
                      setPreferences({
                        ...preferences,
                        privacy: {
                          ...preferences.privacy,
                          consentToProcessing: checked,
                        },
                      });
                    }}
                  />
                </div>
                <Button onClick={handleUpdatePreferences} disabled={isSavingPreferences}>
                  {isSavingPreferences ? 'saving...' : 'save preferences'}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive">Delete Account</CardTitle>
                <CardDescription>permanently delete your account and all associated data (GDPR right to erasure)</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  delete account
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Security Alerts</CardTitle>
                <CardDescription>choose which security events you want to be notified about</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>New Login Alerts</Label>
                    <p className="text-sm text-muted-foreground">notify when a new device logs in</p>
                  </div>
                  <Checkbox
                    checked={preferences.notifications.loginAlerts}
                    onCheckedChange={(checked) => {
                      setPreferences({
                        ...preferences,
                        notifications: {
                          ...preferences.notifications,
                          loginAlerts: checked,
                        },
                      });
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Password Change Alerts</Label>
                    <p className="text-sm text-muted-foreground">notify when your password is changed</p>
                  </div>
                  <Checkbox
                    checked={preferences.notifications.passwordChange}
                    onCheckedChange={(checked) => {
                      setPreferences({
                        ...preferences,
                        notifications: {
                          ...preferences.notifications,
                          passwordChange: checked,
                        },
                      });
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Session Revoked Alerts</Label>
                    <p className="text-sm text-muted-foreground">notify when sessions are revoked</p>
                  </div>
                  <Checkbox
                    checked={preferences.notifications.sessionRevoked}
                    onCheckedChange={(checked) => {
                      setPreferences({
                        ...preferences,
                        notifications: {
                          ...preferences.notifications,
                          sessionRevoked: checked,
                        },
                      });
                    }}
                  />
                </div>
                <Button onClick={handleUpdatePreferences} disabled={isSavingPreferences}>
                  {isSavingPreferences ? 'saving...' : 'save preferences'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Security Audit Log</CardTitle>
                <CardDescription>recent security-relevant events for your account</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingAudit ? (
                  <div className="text-muted-foreground">loading audit log...</div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-muted-foreground">no audit events found</div>
                ) : (
                  <div className="space-y-2">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="flex items-start justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">{log.event.replace(/_/g, ' ')}</div>
                          <div className="text-sm text-muted-foreground">
                            {log.ip} • {log.userAgent || 'unknown'} • {new Date(log.timestamp).toLocaleString()}
                          </div>
                          {log.reason && (
                            <div className="text-xs text-muted-foreground mt-1">reason: {log.reason}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              this action cannot be undone. this will permanently delete your account and all associated data.
              please enter your password to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="deletePassword">Password</Label>
              <Input
                id="deletePassword"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="enter your password"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={isDeleting || !deletePassword}>
              {isDeleting ? 'deleting...' : 'delete account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


