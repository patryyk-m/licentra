'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (result.success) {
        setEmailSent(true);
        toast.success('if an account exists with that email, a password reset link has been sent');
      } else {
        toast.error(result.message || 'failed to send reset email');
      }
    } catch (error) {
      console.error('forgot password error:', error);
      toast.error('an error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">check your email</CardTitle>
            <CardDescription className="text-center">
              we sent a password reset link to {email}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              click the link in the email to reset your password. the link will expire in 1 hour.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEmailSent(false);
                  setEmail('');
                }}
                className="w-full"
              >
                send another email
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push('/login')}
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                back to login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">forgot password</CardTitle>
          <CardDescription className="text-center">
            enter your email address and we&apos;ll send you a reset link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'sending...' : 'send reset link'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            remember your password?{' '}
            <Link href="/login" className="text-primary hover:underline">
              back to login
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

