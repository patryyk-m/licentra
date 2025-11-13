'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { User, Settings, LogOut } from 'lucide-react';
import { toast } from 'sonner';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      const result = await response.json();

      if (result.success && result.data?.user) {
        setUser(result.data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [pathname, fetchUser]);

  useEffect(() => {
    const handleFocus = () => {
      fetchUser();
    };
    
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchUser();
      }
    };
    
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchUser]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuOpen && !event.target.closest('.user-menu-container')) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [userMenuOpen]);

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      const result = await response.json();

      if (result.success) {
        toast.success('Logged out successfully');
        setUser(null);
        setUserMenuOpen(false);
        router.push('/login');
      }
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('An error occurred during logout');
    }
  };

  return (
    <nav className="border-b bg-background sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <span className="text-2xl font-bold text-primary">Licentra</span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <Link href="/apps" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Apps
            </Link>
            <Link href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#docs" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Documentation
            </Link>
            <Link href="#support" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Support
            </Link>
          </div>

          {/* Right Side */}
          <div className="flex items-center space-x-4">
            {isLoading ? (
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : user ? (
              <div className="relative user-menu-container">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="gap-2"
                >
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">{user.username}</span>
                </Button>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute right-0 mt-2 w-48 rounded-lg border bg-background shadow-lg z-50"
                  >
                    <div className="p-2">
                      <Link
                        href="#profile"
                        className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-sm"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <User className="w-4 h-4" />
                        Profile
                      </Link>
                      <Link
                        href="#settings"
                        className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-sm"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-sm w-full text-left text-red-500"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign out
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Sign In</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

