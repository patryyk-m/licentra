import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth';
import User from '@/models/User';
import { normalizeAuthUser } from '@/lib/authz';

export const dynamic = 'force-dynamic';

async function getCurrentUser() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value || null;

  if (!accessToken) return null;

  try {
    const decoded = verifyAccessToken(accessToken);
    const userDoc = await User.findById(decoded.id).select('-passwordHash').lean();
    if (!userDoc) return null;
    if (userDoc.status === 'suspended') return null;
    return normalizeAuthUser(userDoc);
  } catch {
    return null;
  }
}

export default async function AdminLayout({ children }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'admin') {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            &larr; back to dashboard
          </Link>
          <div className="text-sm font-medium text-muted-foreground">admin: {user.username}</div>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-4 py-6 flex gap-6">
        <nav className="w-52 shrink-0 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            admin
          </div>
          <Link
            href="/admin"
            className="block text-sm px-2 py-1.5 rounded-md hover:bg-muted text-foreground"
          >
            overview
          </Link>
          <Link
            href="/admin/users"
            className="block text-sm px-2 py-1.5 rounded-md hover:bg-muted text-foreground"
          >
            users
          </Link>
          <Link
            href="/admin/apps"
            className="block text-sm px-2 py-1.5 rounded-md hover:bg-muted text-foreground"
          >
            apps
          </Link>
          <Link
            href="/admin/logs"
            className="block text-sm px-2 py-1.5 rounded-md hover:bg-muted text-foreground"
          >
            security logs
          </Link>
        </nav>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

