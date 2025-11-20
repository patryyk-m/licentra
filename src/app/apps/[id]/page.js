'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const appId = params?.id;
  const [app, setApp] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [apiSecret, setApiSecret] = useState('');
  const [hasSecret, setHasSecret] = useState(false);
  const [tab, setTab] = useState('settings');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      const t = q.get('tab');
      if (t) setTab(t);
    }
  }, []);

  useEffect(() => {
    if (appId) {
      load();
    }
  }, [appId]);

  const load = async () => {
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
    setHasSecret(Boolean(found.hasApiSecret));
  };

  const save = async (e) => {
    e.preventDefault();
    const res = await fetch(`/api/apps/update/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
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
    const res = await fetch(`/api/apps/reset-secret/${appId}`, { method: 'POST', credentials: 'include' });
    const json = await res.json();
    if (json.success) {
      setApiSecret(json.data.apiSecret);
      setShowSecret(true);
      setHasSecret(true);
      toast.success(hasSecret ? 'secret regenerated' : 'secret generated');
    } else {
      toast.error(json.message || 'failed');
    }
  };

  if (!app) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-muted-foreground">loading...</div>
    </div>
  );

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline"><Link href="/apps">← Back to Apps</Link></Button>
          <h1 className="text-3xl font-bold">{app.name}</h1>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="code">Code Examples</TabsTrigger>
            <TabsTrigger value="credentials">Credentials</TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <Card>
              <CardHeader><CardTitle>App Settings</CardTitle></CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={save}>
                  <div className="space-y-2">
                    <Label htmlFor="name">name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">description</Label>
                    <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                  <Button type="submit">Save</Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

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
                <Button onClick={generateOrRegenerate}>{hasSecret ? 'Regenerate Secret' : 'Generate Secret'}</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="code">
            <Card>
              <CardHeader><CardTitle>Code Examples</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}


