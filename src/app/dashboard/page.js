'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppWindow, Key, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { getEffectiveMonthlyQuota } from '@/lib/plan-limits';

function MetricCard({ label, value, icon: Icon, delay = 0, description, maxValue, monthlyValue }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;
    const duration = 1000;
    const steps = 60;
    const increment = numValue / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= numValue) {
        setDisplayValue(numValue);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  const formatValue = (val) => {
    if (typeof val === 'number') {
      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
      if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
      return val.toLocaleString();
    }
    return val;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      className="relative rounded-xl border bg-card text-card-foreground p-6 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/10 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className="p-2 rounded-lg bg-primary/10 dark:bg-primary/20">
            {Icon && <Icon className="w-5 h-5 text-primary" />}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            {typeof value === 'number' ? formatValue(displayValue) : value}
          </div>
          <div className="text-sm font-medium text-muted-foreground">{label}</div>
          {description && <div className="text-xs text-muted-foreground/70">{description}</div>}
        </div>

        {typeof monthlyValue === 'number' && maxValue && maxValue > 0 && (
          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {monthlyValue.toLocaleString()} / {maxValue === Infinity ? '∞' : maxValue.toLocaleString()} this
                month
              </span>
              <span>{Math.min(Math.round((monthlyValue / maxValue) * 100), 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((monthlyValue / maxValue) * 100, 100)}%` }}
                transition={{ delay: delay + 0.3, duration: 0.8 }}
                className={`h-full rounded-full ${
                  monthlyValue / maxValue >= 0.9
                    ? 'bg-destructive'
                    : monthlyValue / maxValue >= 0.7
                      ? 'bg-yellow-500'
                      : 'bg-gradient-to-r from-primary to-primary/60'
                }`}
              />
            </div>
          </div>
        )}
      </div>

      <div className="absolute top-4 right-4 w-2 h-2 bg-primary rounded-full animate-pulse opacity-60" />
    </motion.div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    activeApps: 0,
    totalLicenses: 0,
    apiCallsMonthly: 0,
    partnerCredits: 0,
  });
  const [userPlan, setUserPlan] = useState('free');

  const fetchData = useCallback(async () => {
    try {
      // fetch user
      const userRes = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      const userJson = await userRes.json();
      if (!userJson.success) {
        router.push('/login');
        return;
      }
      const userData = userJson.data.user;
      setUser(userData);
      setUserPlan(userData.plan || 'free');

      if (userData.role !== 'partner') {
        try {
          const usageRes = await fetch('/api/dashboard/usage', { credentials: 'include' });
          const usageJson = await usageRes.json();
          if (usageJson.success) {
            setStats((prev) => ({
              ...prev,
              apiCallsMonthly: usageJson.data.currentMonth || 0,
            }));
          }
        } catch (e) {
          console.error('Error fetching API usage:', e);
        }
      } else {
        try {
          const creditsRes = await fetch('/api/dashboard/partner-credits', { credentials: 'include' });
          const creditsJson = await creditsRes.json();
          if (creditsJson.success) {
            setStats((prev) => ({
              ...prev,
              partnerCredits: creditsJson.data.totalCredits || 0,
            }));
          }
        } catch (e) {
          console.error('Error fetching partner credits:', e);
        }
      }

      // fetch apps and licenses for stats
      const appsRes = await fetch('/api/apps/list', { credentials: 'include' });
      const appsJson = await appsRes.json();
      let totalLicenses = 0;
      if (appsJson.success && appsJson.data?.apps) {
        const apps = appsJson.data.apps;
        setStats((prev) => ({ ...prev, activeApps: apps.length }));

        // fetch licenses for each app
        for (const app of apps) {
          try {
            const licensesRes = await fetch(`/api/licenses/list?appId=${app.id}`, {
              credentials: 'include',
            });
            const licensesJson = await licensesRes.json();
            if (licensesJson.success) {
              totalLicenses += licensesJson.data?.licenses?.length || 0;
            }
          } catch (e) {
            console.error('Error fetching licenses:', e);
          }
        }
      }

      setStats((prev) => ({
        ...prev,
        totalLicenses,
      }));
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            welcome back, <span className="font-semibold text-foreground">{user.username}</span>
          </p>
          {user.role === 'partner' && (
            <p className="text-xs text-muted-foreground mt-1">partner account</p>
          )}
        </div>

        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              label="Active Apps"
              value={stats.activeApps}
              icon={AppWindow}
              delay={0.1}
            />
            <MetricCard
              label="Total Licenses"
              value={stats.totalLicenses}
              icon={Key}
              delay={0.2}
            />
            {user.role !== 'partner' ? (
              <MetricCard
                label="Plan Quota Usage"
                value={stats.apiCallsMonthly}
                icon={Zap}
                delay={0.3}
                description="This month (resets monthly)"
                monthlyValue={stats.apiCallsMonthly}
                maxValue={getEffectiveMonthlyQuota(userPlan, user?.monthlyQuotaOverride)}
              />
            ) : (
              <MetricCard
                label="Partner Credits"
                value={stats.partnerCredits}
                icon={Zap}
                delay={0.3}
                description="total credits available across your apps"
              />
            )}
          </div>

          <div className="space-y-6">
            {user.role !== 'partner' && (
              <Card>
                <CardHeader>
                  <CardTitle>Your Applications</CardTitle>
                  <CardDescription>manage your apps and licenses</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full">
                    <Link href="/apps">View All Apps</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {user.role === 'partner' && (
              <Card>
                <CardHeader>
                  <CardTitle>Your Assigned Apps</CardTitle>
                  <CardDescription>view apps where you have partner access</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full">
                    <Link href="/apps">View All Apps</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* admin console is linked from the profile menu, dashboard stays focused on apps */}
          </div>
        </div>
      </div>
    </div>
  );
}
