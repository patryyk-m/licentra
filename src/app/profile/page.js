'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { User, Mail, Shield, Calendar } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/profile', { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!json.success) {
        router.push('/login');
        return;
      }
      setUser(json.data.profile);
      setUsername(json.data.profile.username);
    } catch (error) {
      router.push('/login');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSave = async (e) => {
    e.preventDefault();

    if (username.length < 3 || username.length > 30) {
      toast.error('username must be between 3 and 30 characters');
      return;
    }

    if (username === user?.username) {
      toast.info('no changes to save');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username }),
      });

      const json = await res.json();
      if (json.success) {
        toast.success('profile updated');
        fetchProfile();
      } else {
        toast.error(json.message || 'failed to update profile');
      }
    } catch (error) {
      toast.error('network error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="text-muted-foreground mt-2">manage your account information</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>view and update your profile details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="username" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Username
                </Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                  minLength={3}
                  maxLength={30}
                  required
                />
                <p className="text-xs text-muted-foreground">3-30 characters, lowercase only</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email Address
                </Label>
                <Input
                  value={user.email}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">email cannot be changed</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Role / Plan
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={user.role}
                    disabled
                    className="bg-muted flex-1"
                  />
                  <Input
                    value={user.plan}
                    disabled
                    className="bg-muted flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">role and plan are read-only</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Account Created
                </Label>
                <Input
                  value={new Date(user.createdAt).toLocaleDateString()}
                  disabled
                  className="bg-muted"
                />
              </div>

              <Button type="submit" disabled={isSaving || username === user.username}>
                {isSaving ? 'saving...' : 'save changes'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


