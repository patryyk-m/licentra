'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Copy, Download, Trash2 } from 'lucide-react';

export default function LicensesPage() {
  const params = useParams();
  const router = useRouter();
  const appId = params?.id;
  const [user, setUser] = useState(null);
  const [app, setApp] = useState(null);
  const [licenses, setLicenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);

  // Form state
  const [count, setCount] = useState(1);
  const [mask, setMask] = useState('*****-****');
  const [charset, setCharset] = useState({ lowercase: true, uppercase: true, numbers: true, symbols: false });
  const [note, setNote] = useState('');
  const [expiryUnit, setExpiryUnit] = useState('Days');
  const [expiryDuration, setExpiryDuration] = useState(30);
  const [hwidLock, setHwidLock] = useState(false);

  useEffect(() => {
    if (appId) {
      fetchData();
    }
  }, [appId]);

  const fetchData = async () => {
    try {
      const userRes = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      const userJson = await userRes.json();
      if (!userJson.success) {
        router.push('/login');
        return;
      }
      setUser(userJson.data.user);

      const appsRes = await fetch('/api/apps/list', { credentials: 'include' });
      const appsJson = await appsRes.json();
      if (appsJson.success) {
        const found = appsJson.data.apps.find((a) => a.id === appId);
        if (!found) {
          toast.error('app not found');
          router.push('/apps');
          return;
        }
        setApp(found);
      }

      await fetchLicenses();
    } catch (e) {
      router.push('/login');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLicenses = async () => {
    const res = await fetch(`/api/licenses/list?appId=${appId}`, { credentials: 'include' });
    const json = await res.json();
    if (json.success) {
      setLicenses(json.data.licenses);
    } else {
      toast.error(json.message || 'failed to load licenses');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (count < 1 || count > 50) {
      toast.error('count must be between 1 and 50');
      return;
    }

    const selectedCharset = [];
    if (charset.lowercase) selectedCharset.push('abcdefghijklmnopqrstuvwxyz');
    if (charset.uppercase) selectedCharset.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    if (charset.numbers) selectedCharset.push('0123456789');
    if (charset.symbols) selectedCharset.push('!@#');
    const charsetString = selectedCharset.join('');

    if (!charsetString) {
      toast.error('select at least one character set');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/licenses/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId,
          count,
          mask,
          charset: charsetString,
          expiryUnit,
          expiryDuration,
          note,
          hwidLock,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${count} license(s) created`);
        setIsCreateOpen(false);
        setCount(1);
        setMask('*****-****');
        setCharset({ lowercase: true, uppercase: true, numbers: true, symbols: false });
        setNote('');
        setExpiryUnit('Days');
        setExpiryDuration(30);
        setHwidLock(false);
        if (json.data?.keys?.length > 0) {
          toast.message('copy your license keys now', {
            description: json.data.keys.slice(0, 3).join(', ') + (json.data.keys.length > 3 ? '...' : ''),
          });
        }
        await fetchLicenses();
      } else {
        toast.error(json.message || 'failed to create');
      }
    } catch (e) {
      toast.error('network error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (licenseId) => {
    try {
      const res = await fetch(`/api/licenses/delete/${licenseId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (json.success) {
        toast.success('license deleted');
        await fetchLicenses();
      } else {
        toast.error(json.message || 'failed');
      }
    } catch (e) {
      toast.error('network error');
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch(`/api/licenses/export?appId=${appId}`, { credentials: 'include' });
      if (!res.ok) {
        toast.error('failed to export');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `licenses-${appId}-${Date.now()}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('exported successfully');
    } catch (e) {
      toast.error('network error');
    }
  };

  const filteredLicenses = licenses.filter((l) =>
    (l.key || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (l.note || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">loading...</div>
      </div>
    );
  }

  if (!app || !user) return null;

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline"><Link href="/apps">← Back to Apps</Link></Button>
          <h1 className="text-3xl font-bold">{app.name} - Licenses</h1>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">License Actions</h2>
            <p className="text-muted-foreground">create new licenses or export existing ones</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button disabled={!['developer', 'admin'].includes(user.role)}>+ Create Licenses</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>License Configuration</DialogTitle>
                </DialogHeader>
                <form className="space-y-6" onSubmit={handleCreate}>
                  <Card>
                    <CardHeader>
                      <CardTitle>License Configuration</CardTitle>
                      <CardDescription>set up the basic license parameters</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="count">License Amount</Label>
                        <Input
                          id="count"
                          type="number"
                          min="1"
                          max="50"
                          value={count}
                          onChange={(e) => setCount(Number(e.target.value))}
                          required
                        />
                        <p className="text-sm text-muted-foreground">maximum 50 licenses per batch</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="mask">License Mask</Label>
                        <Input
                          id="mask"
                          value={mask}
                          onChange={(e) => setMask(e.target.value)}
                          placeholder="*****-****"
                          required
                        />
                        <p className="text-sm text-muted-foreground">use * for random characters, _ for separators</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Character Set</Label>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="lowercase"
                              checked={charset.lowercase}
                              onCheckedChange={(checked) => setCharset({ ...charset, lowercase: !!checked })}
                            />
                            <Label htmlFor="lowercase" className="font-normal">Lowercase (a-z)</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="uppercase"
                              checked={charset.uppercase}
                              onCheckedChange={(checked) => setCharset({ ...charset, uppercase: !!checked })}
                            />
                            <Label htmlFor="uppercase" className="font-normal">Uppercase (A-Z)</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="numbers"
                              checked={charset.numbers}
                              onCheckedChange={(checked) => setCharset({ ...charset, numbers: !!checked })}
                            />
                            <Label htmlFor="numbers" className="font-normal">Numbers (0-9)</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="symbols"
                              checked={charset.symbols}
                              onCheckedChange={(checked) => setCharset({ ...charset, symbols: !!checked })}
                            />
                            <Label htmlFor="symbols" className="font-normal">Symbols (!@#)</Label>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>License Note (Optional)</CardTitle>
                      <CardDescription>add a note for these licenses</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="add a note for these licenses"
                        rows={3}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Expiry Settings</CardTitle>
                      <CardDescription>configure when licenses expire</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="expiryUnit">Expiry Unit</Label>
                        <Select value={expiryUnit} onValueChange={setExpiryUnit}>
                          <SelectTrigger id="expiryUnit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Days">Days</SelectItem>
                            <SelectItem value="Weeks">Weeks</SelectItem>
                            <SelectItem value="Months">Months</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="expiryDuration">Expiry Duration</Label>
                        <Input
                          id="expiryDuration"
                          type="number"
                          min="1"
                          value={expiryDuration}
                          onChange={(e) => setExpiryDuration(Number(e.target.value))}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Hardware ID (HWID) Lock Settings</CardTitle>
                      <CardDescription>lock licenses to specific devices</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="hwidLock" checked={hwidLock} onCheckedChange={(checked) => setHwidLock(!!checked)} />
                        <Label htmlFor="hwidLock" className="font-normal">Enable HWID Lock</Label>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={creating}>
                      {creating ? 'Creating...' : 'Create'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            <Button variant="outline" onClick={handleExport} disabled={!['developer', 'admin'].includes(user.role)}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder="search licenses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {filteredLicenses.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {licenses.length === 0 ? 'no licenses yet' : 'no licenses match your search'}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredLicenses.map((license) => (
                <Card key={license.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 grid grid-cols-6 gap-4 items-center">
                        <div>
                          <div className="text-sm font-medium font-mono">{license.key}</div>
                          <div className="text-xs text-muted-foreground">License Key</div>
                        </div>
                        <div>
                          <Badge variant={!license.isExpired ? 'default' : 'secondary'}>
                            {license.isExpired ? 'Expired' : 'Active'}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-1">Status</div>
                        </div>
                        <div>
                          <div className="text-sm">{license.createdAt ? new Date(license.createdAt).toLocaleDateString() : '-'}</div>
                          <div className="text-xs text-muted-foreground">Created</div>
                        </div>
                        <div>
                          <div className="text-sm">{license.expiryDate ? new Date(license.expiryDate).toLocaleDateString() : 'Never'}</div>
                          <div className="text-xs text-muted-foreground">Expiry</div>
                        </div>
                        <div>
                          <Badge variant={license.hwidLocked ? 'default' : 'outline'}>
                            {license.hwidLocked ? 'Locked' : 'Unlocked'}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-1">HWID Lock</div>
                        </div>
                        <div>
                          <div className="text-sm">{license.hwid || '-'}</div>
                          <div className="text-xs text-muted-foreground">HWID</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(license.key);
                            toast.success('copied');
                          }}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        {['developer', 'admin'].includes(user.role) && (
                          <Button variant="outline" size="sm" onClick={() => handleDelete(license.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {license.note && (
                      <div className="mt-2 text-sm text-muted-foreground">Note: {license.note}</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

