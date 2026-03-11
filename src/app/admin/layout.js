import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth';
import User from '@/models/User';
import { normalizeAuthUser } from '@/lib/authz';
import { AdminNav } from '@/app/admin/_components/admin-sidebar';

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
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <AdminNav />
        <main>{children}</main>
      </div>
    </div>
  );
}

