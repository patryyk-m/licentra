'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, AppWindow, FileText, Ban } from 'lucide-react';
import { cn } from '@/components/ui/utils';

const navItems = [
  { href: '/admin', label: 'overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'users', icon: Users },
  { href: '/admin/apps', label: 'apps', icon: AppWindow },
  { href: '/admin/logs', label: 'security logs', icon: FileText },
  { href: '/admin/blocked-ips', label: 'blocked ips', icon: Ban },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex items-center gap-1 rounded-lg border bg-muted/50 p-1 min-w-max sm:min-w-0">
      {navItems.map((item) => {
        const isActive =
          item.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
      </div>
    </nav>
  );
}
