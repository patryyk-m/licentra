'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import AppSecurityTab from './AppSecurityTab';
import { performStepUp, isStepUpRequired } from '@/lib/step-up';

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const appId = params?.id;
  const [app, setApp] = useState(null);
  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [validationsPerMinutePerLicense, setValidationsPerMinutePerLicense] = useState(10);
  const [autoSuspendOnRateLimitAbuse, setAutoSuspendOnRateLimitAbuse] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [apiSecret, setApiSecret] = useState('');
  const [hasSecret, setHasSecret] = useState(false);
  const [tab, setTab] = useState('settings');
  const [collaborators, setCollaborators] = useState([]);
  const [partners, setPartners] = useState([]);
  const [invites, setInvites] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [createPartnerInviteLoading, setCreatePartnerInviteLoading] = useState(false);
  const [createDeveloperInviteLoading, setCreateDeveloperInviteLoading] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [clearingInviteId, setClearingInviteId] = useState(null);
  const [partnerCreditDrafts, setPartnerCreditDrafts] = useState({});
  const [grantingPartnerId, setGrantingPartnerId] = useState(null);
  const [partnerDefaultsEnabled, setPartnerDefaultsEnabled] = useState(false);
  const [partnerDefaultMask, setPartnerDefaultMask] = useState('*****-****');
  const [partnerDefaultLowercase, setPartnerDefaultLowercase] = useState(true);
  const [partnerDefaultUppercase, setPartnerDefaultUppercase] = useState(true);
  const [partnerDefaultNumbers, setPartnerDefaultNumbers] = useState(true);
  const [partnerDefaultSymbols, setPartnerDefaultSymbols] = useState(false);

  const isOwner = useMemo(() => Boolean(user && app && app.ownerId === user.id), [user, app]);
  const isAdmin = user?.role === 'admin';
  const canManageCollaborators = isAdmin || isOwner;
  const canManagePartners = isAdmin || isOwner;
  const hasFullAppAccess = useMemo(() => {
    if (!user || !app) return false;
    if (isAdmin) return true;
    if (isOwner) return true;
    const isCollaborator = Array.isArray(user?.developerApps)
      ? user.developerApps.some((appId) => appId === app.id)
      : false;
    return isCollaborator;
  }, [user, app, isAdmin, isOwner]);
  const canGrantPartnerCredits = hasFullAppAccess && user?.role !== 'partner';

  const canEditApp = hasFullAppAccess;
  const availableTabs = useMemo(() => {
    const tabs = [];
    if (hasFullAppAccess) {
      tabs.push('settings');
      tabs.push('credentials');
      tabs.push('code');
      tabs.push('security');
    }
    if (canManagePartners || canGrantPartnerCredits) {
      tabs.push('invites');
    }
    return tabs;
  }, [hasFullAppAccess, canManagePartners, canGrantPartnerCredits]);

  useEffect(() => {
    if (availableTabs.length === 0) return;
    const preferred = hasFullAppAccess ? 'settings' : availableTabs[0];
    if (!availableTabs.includes(tab)) {
      setTab(preferred);
    }
  }, [availableTabs, hasFullAppAccess, tab]);

  const fetchCurrentUser = useCallback(async () => {
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
    }
  }, [router]);

  const load = useCallback(async () => {
    const res = await fetch('/api/apps/list', { credentials: 'include' });
    const json = await res.json();
    if (!json.success) {
      router.push('/apps');
      return;
    }
    const found = json.data.apps.find((a) => a.id === appId);
    if (!found) {
      toast.error('app not found');
      router.push('/apps');
      return;
    }
    setApp(found);
    setName(found.name);
    setDescription(found.description || '');
    setValidationsPerMinutePerLicense(found.validationsPerMinutePerLicense ?? 10);
    setAutoSuspendOnRateLimitAbuse(found.autoSuspendOnRateLimitAbuse ?? false);
    setHasSecret(Boolean(found.hasApiSecret));
    const cfg = found.partnerLicenseConfig || {};
    setPartnerDefaultsEnabled(Boolean(cfg.enabled));
    setPartnerDefaultMask(cfg.mask || '*****-****');
    setPartnerDefaultLowercase(cfg.lowercase ?? true);
    setPartnerDefaultUppercase(cfg.uppercase ?? true);
    setPartnerDefaultNumbers(cfg.numbers ?? true);
    setPartnerDefaultSymbols(cfg.symbols ?? false);
  }, [appId, router]);

  useEffect(() => {
    if (appId) {
      load();
    }
  }, [appId, load]);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (user?.role === 'partner' && appId && !hasFullAppAccess) {
      router.replace(`/apps/${appId}/licenses`);
    }
  }, [user, hasFullAppAccess, appId, router]);

  const save = async (e) => {
    e.preventDefault();
    const res = await fetch(`/api/apps/update/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description,
        validationsPerMinutePerLicense: Math.min(Math.max(Number(validationsPerMinutePerLicense) || 10, 1), 100),
        autoSuspendOnRateLimitAbuse,
        partnerLicenseConfig: {
          enabled: partnerDefaultsEnabled,
          mask: partnerDefaultMask,
          lowercase: partnerDefaultLowercase,
          uppercase: partnerDefaultUppercase,
          numbers: partnerDefaultNumbers,
          symbols: partnerDefaultSymbols,
        },
      }),
    });
    const json = await res.json();
    if (json.success) {
      toast.success('saved');
      await load();
    } else {
      toast.error(json.message || 'failed');
    }
  };

  const generateOrRegenerate = async () => {
    let res = await fetch(`/api/apps/reset-secret/${appId}`, { method: 'POST', credentials: 'include' });
    let json = await res.json();
    if (isStepUpRequired(res, json)) {
      if (!(await performStepUp())) return;
      res = await fetch(`/api/apps/reset-secret/${appId}`, { method: 'POST', credentials: 'include' });
      json = await res.json();
    }
    if (json.success) {
      setApiSecret(json.data.apiSecret);
      setShowSecret(true);
      setHasSecret(true);
      toast.success(hasSecret ? 'secret regenerated' : 'secret generated');
    } else {
      toast.error(json.message || 'failed');
    }
  };

  const loadMembers = useCallback(async () => {
    if (!appId) return;
    setMembersLoading(true);
    setMembersError('');
    try {
      const res = await fetch(`/api/apps/${appId}/invites/list`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        const normalizedInvites = (json.data.invites || []).map((invite) => ({
          ...invite,
          targetRole: invite.targetRole === 'collaborator' ? 'collaborator' : 'partner',
        }));
        setPartners(json.data.partners || []);
        setCollaborators(json.data.collaborators || []);
        setInvites(normalizedInvites);
      } else {
        setMembersError(json.message || 'unable to load collaborators and partners');
      }
    } catch (error) {
      setMembersError('network error while loading collaborators and partners');
    } finally {
      setMembersLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    if (tab === 'invites' && (canManagePartners || canGrantPartnerCredits)) {
      loadMembers();
    }
  }, [tab, appId, canManagePartners, canGrantPartnerCredits, loadMembers]);

  const handleTabChange = (value) => {
    if (!availableTabs.includes(value)) return;
    setTab(value);
  };

  const createInvite = async (targetRole = 'partner') => {
    if (!appId) return;
    const needsCollaboratorPrivileges = targetRole === 'collaborator';
    if (needsCollaboratorPrivileges && !canManageCollaborators) {
      toast.error('Only the app owner can invite new collaborators.');
      return;
    }
    if (!needsCollaboratorPrivileges && !canManagePartners) {
      toast.error('Only the app owner can invite partners.');
      return;
    }

    const setLoading =
      targetRole === 'collaborator' ? setCreateDeveloperInviteLoading : setCreatePartnerInviteLoading;
    setLoading(true);
    try {
      const res = await fetch(`/api/apps/${appId}/invites/create`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: targetRole }),
      });
      const json = await res.json();
      if (json.success) {
        const roleLabel = targetRole === 'collaborator' ? 'collaborator' : 'partner';
        toast.success(`${roleLabel} invite created`);
        if (
          json.data?.invite?.code &&
          typeof navigator !== 'undefined' &&
          navigator?.clipboard
        ) {
          try {
            await navigator.clipboard.writeText(json.data.invite.code);
            toast.success('code copied to clipboard');
          } catch {
            // ignore clipboard errors
          }
        }
        await loadMembers();
      } else {
        toast.error(json.message || 'failed to create invite');
      }
    } catch (error) {
      toast.error('network error while creating invite');
    } finally {
      setLoading(false);
    }
  };

  const removePartner = async (partnerId) => {
    if (!appId || !partnerId) return;
    if (!canManagePartners) {
      toast.error('Only the app owner can remove partners.');
      return;
    }
    const confirmed = typeof window === 'undefined' ? true : window.confirm('Remove this partner from the app?');
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/apps/${appId}/members/remove`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: partnerId, role: 'partner' }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('partner removed');
        await loadMembers();
      } else {
        toast.error(json.message || 'failed to remove partner');
      }
    } catch (error) {
      toast.error('network error while removing partner');
    }
  };

  const removeCollaborator = async (collaboratorId) => {
    if (!appId || !collaboratorId) return;
    if (!canManageCollaborators) {
      toast.error('Only the app owner can remove collaborators.');
      return;
    }
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm('Remove this collaborator from the app?');
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/apps/${appId}/members/remove`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: collaboratorId, role: 'collaborator' }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('collaborator removed');
        await loadMembers();
      } else {
        toast.error(json.message || 'failed to remove collaborator');
      }
    } catch (error) {
      toast.error('network error while removing collaborator');
    }
  };

  const grantPartnerCredits = async (partnerId) => {
    if (!appId || !partnerId || !canGrantPartnerCredits) return;
    const raw = partnerCreditDrafts[partnerId];
    const credits = Number(raw);
    if (!Number.isFinite(credits) || credits < 1) {
      toast.error('enter at least 1 credit');
      return;
    }

    setGrantingPartnerId(partnerId);
    try {
      const res = await fetch(`/api/apps/${appId}/partner-credits/grant`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerUserId: partnerId, credits: Math.floor(credits) }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('credits granted');
        setPartnerCreditDrafts((prev) => ({ ...prev, [partnerId]: '' }));
        await loadMembers();
      } else {
        toast.error(json.message || 'failed to grant credits');
      }
    } catch (error) {
      toast.error('network error while granting credits');
    } finally {
      setGrantingPartnerId(null);
    }
  };

  const copyInviteCode = async (code) => {
    if (!code) return;
    if (typeof navigator === 'undefined' || !navigator?.clipboard) {
      toast.error('clipboard not available in this environment');
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      toast.success('code copied');
    } catch (error) {
      toast.error('unable to copy code');
    }
  };

  const clearInvite = async (inviteId) => {
    if (!appId || !inviteId) return;
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm('Clear this invite code? This permanently deletes the code so no one can redeem it.');
    if (!confirmed) return;
    setClearingInviteId(inviteId);
    try {
      const res = await fetch(`/api/apps/${appId}/invites/${inviteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (json.success) {
        toast.success('invite cleared');
        await loadMembers();
      } else {
        toast.error(json.message || 'failed to clear invite');
      }
    } catch (error) {
      toast.error('network error while clearing invite');
    } finally {
      setClearingInviteId(null);
    }
  };

  const activeInviteCount = invites.filter((invite) => invite.status === 'active').length;
  const activeCollaboratorInviteCount = invites.filter(
    (invite) => invite.status === 'active' && invite.targetRole === 'collaborator'
  ).length;
  const activePartnerInviteCount = invites.filter(
    (invite) => invite.status === 'active' && invite.targetRole === 'partner'
  ).length;
  const partnerCount = partners.length;
  const collaboratorCount = collaborators.length;

  const formatDate = (value) => {
    if (!value) return 'n/a';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  if (!app) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-muted-foreground">loading...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="outline"><Link href="/apps">← Back to Apps</Link></Button>
            <div>
              <h1 className="text-3xl font-bold">{app.name}</h1>
              <p className="text-muted-foreground mt-2">app settings, credentials, and security</p>
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
          <TabsList>
            {hasFullAppAccess && <TabsTrigger value="settings">Settings</TabsTrigger>}
            {hasFullAppAccess && <TabsTrigger value="credentials">Credentials</TabsTrigger>}
            {hasFullAppAccess && <TabsTrigger value="code">Code Examples</TabsTrigger>}
            {hasFullAppAccess && <TabsTrigger value="security">Security</TabsTrigger>}
            {canManagePartners && <TabsTrigger value="invites">Invite to App</TabsTrigger>}
          </TabsList>

          {hasFullAppAccess && (
            <TabsContent value="settings">
              <Card>
                <CardHeader><CardTitle>App Settings</CardTitle></CardHeader>
                <CardContent>
                  {!canEditApp && (
                    <p className="text-sm text-muted-foreground mb-4">
                      You have read-only access to this app.
                    </p>
                  )}
                  <form className="space-y-4" onSubmit={save}>
                    <div className="space-y-2">
                      <Label htmlFor="name">name</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={!canEditApp}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">description</Label>
                      <Input
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={!canEditApp}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="validationsPerMinutePerLicense">validations per license per minute</Label>
                      <Input
                        id="validationsPerMinutePerLicense"
                        type="number"
                        min={1}
                        max={100}
                        value={validationsPerMinutePerLicense}
                        onChange={(e) => setValidationsPerMinutePerLicense(Number(e.target.value) || 10)}
                        disabled={!canEditApp}
                      />
                      <p className="text-xs text-muted-foreground">limits how often each license can call the validate api (1–100). default 10.</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="autoSuspendOnRateLimitAbuse"
                        checked={autoSuspendOnRateLimitAbuse}
                        onCheckedChange={(checked) => setAutoSuspendOnRateLimitAbuse(!!checked)}
                        disabled={!canEditApp}
                      />
                      <Label htmlFor="autoSuspendOnRateLimitAbuse" className="font-normal cursor-pointer">
                        auto-suspend license when rate limit abuse is detected
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      when enabled, licenses with 50+ blocked validation requests in 10 min are automatically suspended. you can reactivate them from manage licenses.
                    </p>
                    <div className="mt-6 border-t pt-4 space-y-3">
                      <h2 className="text-sm font-semibold">partner license defaults</h2>
                      <p className="text-xs text-muted-foreground">
                        when enabled, partners creating licenses for this app will use this mask and character set. this keeps all partner generated keys consistent.
                      </p>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="partnerDefaultsEnabled"
                          checked={partnerDefaultsEnabled}
                          onCheckedChange={(checked) => setPartnerDefaultsEnabled(!!checked)}
                          disabled={!canEditApp}
                        />
                        <Label htmlFor="partnerDefaultsEnabled" className="font-normal cursor-pointer">
                          enable partner defaults
                        </Label>
                      </div>
                      {partnerDefaultsEnabled && (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor="partnerMask">partner license mask</Label>
                            <Input
                              id="partnerMask"
                              value={partnerDefaultMask}
                              onChange={(e) => setPartnerDefaultMask(e.target.value)}
                              disabled={!canEditApp}
                            />
                            <p className="text-xs text-muted-foreground">use * for random characters and _ for separators. example: *****-****</p>
                          </div>
                          <div className="space-y-2">
                            <Label>partner character set</Label>
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="partnerLowercase"
                                  checked={partnerDefaultLowercase}
                                  onCheckedChange={(checked) => setPartnerDefaultLowercase(!!checked)}
                                  disabled={!canEditApp}
                                />
                                <Label htmlFor="partnerLowercase" className="font-normal">lowercase (a-z)</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="partnerUppercase"
                                  checked={partnerDefaultUppercase}
                                  onCheckedChange={(checked) => setPartnerDefaultUppercase(!!checked)}
                                  disabled={!canEditApp}
                                />
                                <Label htmlFor="partnerUppercase" className="font-normal">uppercase (A-Z)</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="partnerNumbers"
                                  checked={partnerDefaultNumbers}
                                  onCheckedChange={(checked) => setPartnerDefaultNumbers(!!checked)}
                                  disabled={!canEditApp}
                                />
                                <Label htmlFor="partnerNumbers" className="font-normal">numbers (0-9)</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="partnerSymbols"
                                  checked={partnerDefaultSymbols}
                                  onCheckedChange={(checked) => setPartnerDefaultSymbols(!!checked)}
                                  disabled={!canEditApp}
                                />
                                <Label htmlFor="partnerSymbols" className="font-normal">symbols (!@#)</Label>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                at least one character type must be selected.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <Button type="submit" disabled={!canEditApp}>
                      Save
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {hasFullAppAccess && (
            <TabsContent value="credentials">
              <Card>
                <CardHeader><CardTitle>API Secret</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {apiSecret ? (
                    <div className="flex items-center gap-2">
                      <Input type={showSecret ? 'text' : 'password'} readOnly value={apiSecret} />
                      <Button variant="outline" onClick={() => setShowSecret((s) => !s)}>{showSecret ? 'Hide' : 'Show'}</Button>
                      <Button variant="outline" onClick={() => { navigator.clipboard.writeText(apiSecret); toast.success('copied'); }}>Copy</Button>
                    </div>
                  ) : hasSecret ? (
                    <p className="text-muted-foreground text-sm">
                      secret already generated. we only display it right after creation.
                      click regenerate if you need a new one and store it somewhere safe.
                    </p>
                  ) : (
                    <p className="text-muted-foreground">no secret generated yet</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    remember to copy the secret immediately — it can&apos;t be recovered later.
                  </p>
                  <Button onClick={generateOrRegenerate} disabled={!canEditApp}>
                    {hasSecret ? 'Regenerate Secret' : 'Generate Secret'}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {hasFullAppAccess && (
            <TabsContent value="code">
              <Card>
                <CardHeader><CardTitle>Code Examples</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">coming soon</p>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {hasFullAppAccess && (
            <TabsContent value="security">
              <AppSecurityTab appId={appId} />
            </TabsContent>
          )}

          {(canManagePartners || canGrantPartnerCredits) && (
            <TabsContent value="invites">
              <div className="space-y-4">
                {membersError && (
                  <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {membersError}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>Invite overview</CardTitle>
                      <Button size="sm" variant="outline" onClick={loadMembers} disabled={membersLoading}>
                        {membersLoading ? 'Refreshing...' : 'Refresh'}
                      </Button>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Partners</p>
                        <p className="text-2xl font-semibold">{partnerCount}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Collaborators</p>
                        <p className="text-2xl font-semibold">{collaboratorCount}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Active invites</p>
                        <p className="text-2xl font-semibold">{activeInviteCount}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Partner invites</CardTitle>
                      <CardDescription>Share codes with distribution partners (30-day expiry).</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
                      <div className="text-sm text-muted-foreground flex-1">
                        <p>Create a single use code for partners.</p>
                        <p className="mt-1">Active codes: {activePartnerInviteCount}</p>
                      </div>
                      <Button onClick={() => createInvite('partner')} disabled={createPartnerInviteLoading || !canManagePartners}>
                        {createPartnerInviteLoading ? 'Generating...' : 'Generate partner code'}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Collaborator invites</CardTitle>
                      <CardDescription>Invite developers with full access.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
                      <div className="text-sm text-muted-foreground flex-1">
                        <p>Collaborators can edit settings, issue licenses, and manage invites.</p>
                        <p className="mt-1">Active codes: {activeCollaboratorInviteCount}</p>
                      </div>
                      <Button onClick={() => createInvite('collaborator')} disabled={createDeveloperInviteLoading || !(isAdmin || isOwner)}>
                        {createDeveloperInviteLoading ? 'Generating...' : 'Generate collaborator code'}
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Invite codes</CardTitle>
                    <CardDescription>Share these codes securely.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {invites.length === 0 && !membersLoading && (
                      <p className="text-sm text-muted-foreground">No invite codes yet.</p>
                    )}
                    {invites.length > 0 && (
                      <div className="space-y-3">
                        {invites.map((invite) => (
                          <div
                            key={invite.id}
                            className="flex flex-col gap-2 rounded border border-border p-3 md:flex-row md:items-center md:justify-between"
                          >
                            <div>
                              <p className="font-mono text-sm">{invite.code}</p>
                              <p className="text-xs text-muted-foreground">
                                status: {invite.status} • created {formatDate(invite.createdAt)}
                                {invite.expiresAt && ` • expires ${formatDate(invite.expiresAt)}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={invite.status === 'active' ? 'default' : 'secondary'}>
                                {invite.status}
                              </Badge>
                              <Badge variant="outline">
                                {invite.targetRole === 'collaborator' ? 'collaborator' : 'partner'}
                              </Badge>
                              {invite.status === 'active' && (
                                <Button variant="outline" size="sm" onClick={() => copyInviteCode(invite.code)}>
                                  Copy
                                </Button>
                              )}
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => clearInvite(invite.id)}
                                disabled={clearingInviteId === invite.id}
                              >
                                {clearingInviteId === invite.id ? 'Clearing...' : 'Clear'}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {membersLoading && (
                      <p className="text-sm text-muted-foreground">loading...</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Current partners</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {partners.length === 0 && !membersLoading && (
                      <p className="text-sm text-muted-foreground">No partners assigned yet.</p>
                    )}
                    {partners.length > 0 && (
                      <div className="space-y-3">
                        {partners.map((r) => (
                          <div
                            key={r.id}
                            className="flex flex-col gap-2 rounded border border-border p-3 md:flex-row md:items-center md:justify-between"
                          >
                            <div>
                              <p className="font-medium">{r.username}</p>
                              <p className="text-sm text-muted-foreground">{r.email}</p>
                              <p className="text-xs text-muted-foreground">
                                added {formatDate(r.joinedAt)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                credits: {Number(r.credits || 0)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {canGrantPartnerCredits && (
                                <>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={partnerCreditDrafts[r.id] ?? ''}
                                    onChange={(e) =>
                                      setPartnerCreditDrafts((prev) => ({
                                        ...prev,
                                        [r.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="credits"
                                    className="w-24"
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => grantPartnerCredits(r.id)}
                                    disabled={membersLoading || grantingPartnerId === r.id}
                                  >
                                    {grantingPartnerId === r.id ? 'granting...' : 'grant'}
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => removePartner(r.id)}
                                disabled={membersLoading || !canManagePartners}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {membersLoading && (
                      <p className="text-sm text-muted-foreground">loading...</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Collaborators</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {collaborators.length === 0 && !membersLoading && (
                      <p className="text-sm text-muted-foreground">No collaborators yet.</p>
                    )}
                    {collaborators.length > 0 && (
                      <div className="space-y-3">
                        {collaborators.map((dev) => (
                          <div
                            key={dev.id}
                            className="flex flex-col gap-2 rounded border border-border p-3 md:flex-row md:items-center md:justify-between"
                          >
                            <div>
                              <p className="font-medium">{dev.username}</p>
                              <p className="text-sm text-muted-foreground">{dev.email}</p>
                              <p className="text-xs text-muted-foreground">
                                added {formatDate(dev.joinedAt)}
                              </p>
                            </div>
                            {canManageCollaborators && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => removeCollaborator(dev.id)}
                                disabled={membersLoading}
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {membersLoading && (
                      <p className="text-sm text-muted-foreground">loading...</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}


