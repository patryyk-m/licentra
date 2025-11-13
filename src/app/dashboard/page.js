'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AppWindow, Key, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import MetricCard from '@/components/dashboard/MetricCard';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import SystemStatus from '@/components/dashboard/SystemStatus';
import { mockLicenseGenerations, mockLicenseValidations } from '@/lib/mockData';
import ActivityCalendar from '@/components/dashboard/ActivityCalendar';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    activeApps: 0,
    totalLicenses: 0,
    apiCalls: 0,
  });
  const [activities, setActivities] = useState([]);
  const [systemMetrics, setSystemMetrics] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // fetch user
      const userRes = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      const userJson = await userRes.json();
      if (!userJson.success) {
        router.push('/login');
        return;
      }
      setUser(userJson.data.user);

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
        apiCalls: 1247,
      }));

      // fetch activity
      const activityRes = await fetch('/api/activity/list', { credentials: 'include' });
      const activityJson = await activityRes.json();
      if (activityJson.success) {
        setActivities(activityJson.data.activities || []);
      }

      // fetch system status
      const systemRes = await fetch('/api/system/status', { credentials: 'include' });
      const systemJson = await systemRes.json();
      if (systemJson.success) {
        setSystemMetrics(systemJson.data.metrics || {});
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };


  const handleClearActivity = () => {
    setActivities([]);
    toast.success('activity cleared');
  };

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
      {/* header */}
      <div className="bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              welcome back, <span className="font-semibold text-foreground">{user.username}</span> 👋
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* metrics grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            label="Active Apps"
            value={stats.activeApps}
            icon={AppWindow}
            delay={0.1}
            trend={5}
          />
          <MetricCard
            label="Total Licenses"
            value={stats.totalLicenses}
            icon={Key}
            delay={0.2}
            trend={12}
          />
          <MetricCard
            label="API Calls"
            value={stats.apiCalls}
            icon={Zap}
            delay={0.3}
            description="Last 24h"
          />
        </div>

        {/* charts and activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* activity calendars */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="shadow-sm h-full flex flex-col">
              <CardHeader>
                <CardTitle>Activity Overview</CardTitle>
                <CardDescription>license generation and validation activity</CardDescription>
              </CardHeader>
              <CardContent className="overflow-visible flex-1 flex flex-col">
                <Tabs defaultValue="generations" className="w-full flex-1 flex flex-col">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="generations">License Generations</TabsTrigger>
                    <TabsTrigger value="validations">License Validations</TabsTrigger>
                  </TabsList>
                  <TabsContent value="generations" className="mt-6 flex-1">
                    <ActivityCalendar
                      data={mockLicenseGenerations}
                      label="License Generations"
                      delay={0.1}
                    />
                  </TabsContent>
                  <TabsContent value="validations" className="mt-6 flex-1">
                    <ActivityCalendar
                      data={mockLicenseValidations}
                      label="License Validations"
                      delay={0.2}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* activity feed */}
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <ActivityFeed
                activities={activities}
                userRole={user.role}
                onClear={handleClearActivity}
              />
            </CardContent>
          </Card>
        </div>

        {/* system status and role based sections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SystemStatus metrics={systemMetrics} delay={0.6} />

          {/* role based content */}
          <div className="lg:col-span-2 space-y-6">
            {user.role === 'developer' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="space-y-4"
              >
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Your Applications</CardTitle>
                    <CardDescription>manage your apps and licenses</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-visible">
                    <Button asChild className="w-full">
                      <Link href="/apps">View All Apps</Link>
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {user.role === 'redistributor' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="space-y-4"
              >
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Assigned App</CardTitle>
                    <CardDescription>manage licenses from your assigned app</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-visible">
                    <div className="text-muted-foreground text-sm">no assigned licenses yet</div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {user.role === 'admin' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="space-y-4"
              >
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>System Overview</CardTitle>
                    <CardDescription>admin system metrics</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                        <div className="text-2xl font-bold text-primary">127</div>
                        <div className="text-sm text-muted-foreground">Active Users</div>
                      </div>
                      <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                        <div className="text-2xl font-bold text-primary">45</div>
                        <div className="text-sm text-muted-foreground">Total Apps</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
