'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NotificationsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/apps');
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-muted-foreground">redirecting...</div>
    </div>
  );
}
