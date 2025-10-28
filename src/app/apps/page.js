'use client';

import { useEffect, useState } from 'react';
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
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
  };

  const fetchApps = async () => {
    const res = await fetch('/api/apps/list', { credentials: 'include' });
    const json = await res.json();
    if (json.success) {
      setApps(json.data.apps);
    } else {
      toast.error(json.message || 'failed to load apps');
    }
  };

  const handleDragEnd = async (event) => {
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Applications</h1>
            <p className="text-muted-foreground">manage your apps and credentials</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button disabled={user && !['developer','admin'].includes(user.role)} title={user && !['developer','admin'].includes(user.role) ? 'only developers or admins can create apps' : undefined}>Create Application</Button>
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
        </div>

        {apps.length === 0 ? (
          <Card className="col-span-full">
            <CardHeader>
              <CardTitle>No applications</CardTitle>
              <CardDescription>create your first application to get started</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsCreateOpen(true)}>Create Application</Button>
            </CardContent>
          </Card>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={apps.map((a) => a.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {apps.map((app) => (
                  <AppCard key={app.id} app={app} onChanged={fetchApps} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}


