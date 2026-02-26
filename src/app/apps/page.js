'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import AppCard from '@/components/apps/AppCard';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';

export default function AppsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apps, setApps] = useState([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [claimingCode, setClaimingCode] = useState('');
  const [isClaimingCode, setIsClaimingCode] = useState(false);
  const [developerClaimCode, setDeveloperClaimCode] = useState('');
  const [isClaimingDeveloperCode, setIsClaimingDeveloperCode] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const canCreateApp = ['developer', 'admin'].includes(user?.role);
  const canReorderApps = canCreateApp || user?.role === 'partner';

  const fetchApps = useCallback(async () => {
    const res = await fetch('/api/apps/list', { credentials: 'include' });
    const json = await res.json();
    if (json.success) {
      setApps(json.data.apps || []);
    }
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const json = await res.json();
      if (!json.success) {
        router.push('/login');
        return;
      }
      setUser(json.data.user);
      await fetchApps();
    } catch (e) {
      router.push('/login');
    } finally {
      setIsLoading(false);
    }
  }, [router, fetchApps]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleClaimCode = async (e) => {
    e.preventDefault();
    const trimmed = claimingCode.trim();
    if (!trimmed) {
      toast.error('enter a partner code first');
      return;
    }
    setIsClaimingCode(true);
    try {
      const res = await fetch('/api/partners/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('partner code applied. new apps unlocked.');
        setClaimingCode('');
        setUser((prev) => (prev ? { ...prev, partnerApps: json.data.partnerApps } : prev));
        await fetchApps();
      } else {
        toast.error(json.message || 'failed to apply code');
      }
    } catch (error) {
      toast.error('network error while applying code');
    } finally {
      setIsClaimingCode(false);
    }
  };

  const handleClaimDeveloperCode = async (e) => {
    e.preventDefault();
    const trimmed = developerClaimCode.trim();
    if (!trimmed) {
      toast.error('enter a collaborator invite code first');
      return;
    }
    setIsClaimingDeveloperCode(true);
    try {
      const res = await fetch('/api/collaborators/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('collaborator code applied. full access granted.');
        setDeveloperClaimCode('');
        setUser((prev) => (prev ? { ...prev, developerApps: json.data.developerApps } : prev));
        await fetchApps();
      } else {
        toast.error(json.message || 'failed to apply code');
      }
    } catch (error) {
      toast.error('network error while applying developer code');
    } finally {
      setIsClaimingDeveloperCode(false);
    }
  };

  const handleDragEnd = async (event) => {
    if (!canReorderApps) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = apps.findIndex((app) => app.id === active.id);
    const newIndex = apps.findIndex((app) => app.id === over.id);

    const newApps = [...apps];
    const [moved] = newApps.splice(oldIndex, 1);
    newApps.splice(newIndex, 0, moved);

    setApps(newApps);

    try {
      await fetch('/api/apps/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newApps.map((a) => a.id) }),
      });
    } catch (error) {
      toast.error('failed to save sort order');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name || name.length < 2) {
      toast.error('name must be at least 2 characters');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/apps/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('application created successfully');
        setIsCreateOpen(false);
        setName('');
        setDescription('');
        await fetchApps();
      } else {
        toast.error(json.message || 'failed to create');
      }
    } catch (e) {
      toast.error('network error');
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Applications</h1>
            <p className="text-muted-foreground mt-2">manage your apps and credentials</p>
          </div>
          {canCreateApp && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>Create Application</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Application</DialogTitle>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleCreate}>
                  <div className="space-y-2">
                    <Label htmlFor="name">application name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="my app" required minLength={2} maxLength={40} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">description (optional)</Label>
                    <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="short description" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create'}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="space-y-6">
          {['developer', 'admin'].includes(user.role) && (
            <Card>
              <CardHeader>
                <CardTitle>Add another application</CardTitle>
                <CardDescription>enter a collaborator invite code to unlock an app</CardDescription>
              </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleClaimDeveloperCode}>
                <Input
                  value={developerClaimCode}
                  onChange={(e) => setDeveloperClaimCode(e.target.value)}
                  placeholder="collaborator invite code"
                  className="flex-1"
                  spellCheck={false}
                />
                <Button type="submit" disabled={isClaimingDeveloperCode}>
                  {isClaimingDeveloperCode ? 'Applying...' : 'Apply code'}
                </Button>
              </form>
              </CardContent>
            </Card>
          )}

          {user.role === 'partner' && (
            <Card>
              <CardHeader>
                <CardTitle>Add another application</CardTitle>
                <CardDescription>enter a partner invite code to unlock another app</CardDescription>
              </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleClaimCode}>
                <Input
                  value={claimingCode}
                  onChange={(e) => setClaimingCode(e.target.value)}
                  placeholder="partner invite code"
                  className="flex-1"
                  spellCheck={false}
                />
                <Button type="submit" disabled={isClaimingCode}>
                  {isClaimingCode ? 'Applying...' : 'Apply code'}
                </Button>
              </form>
              </CardContent>
            </Card>
          )}

          {apps.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No applications</CardTitle>
                <CardDescription>
                  {canCreateApp
                    ? 'create your first application to get started'
                    : 'ask an owner for access or apply an invite code above'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {canCreateApp ? (
                  <Button onClick={() => setIsCreateOpen(true)}>
                    Create Application
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">apply a partner invite code to unlock apps</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={apps.map((a) => a.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {apps.map((app) => (
                    <AppCard key={app.id} app={app} onChanged={fetchApps} userRole={user?.role} currentUser={user} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  );
}


