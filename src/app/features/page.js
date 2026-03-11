'use client';

import { Card, CardContent } from '@/components/ui/card';
import Footer from '@/components/layout/Footer';
import {
  Key,
  Shield,
  Terminal,
  Users,
  BarChart3,
  Bell,
  Lock,
  FileSpreadsheet,
  Zap,
} from 'lucide-react';

const FEATURE_GROUPS = [
  {
    title: 'License management',
    items: [
      { icon: Key, title: 'Batch key generation', desc: 'Create up to 50 licenses at once with custom mask, charset and expiry.' },
      { icon: Lock, title: 'Device binding (HWID)', desc: 'Lock licenses to 1–5 devices. Prevent sharing across machines.' },
      { icon: Shield, title: 'Suspend & reactivate', desc: 'Instantly suspend abused licenses and reactivate when needed.' },
      { icon: FileSpreadsheet, title: 'CSV export', desc: 'Export all licenses for backup or integration.' },
    ],
  },
  {
    title: 'Validation API',
    items: [
      { icon: Terminal, title: 'REST API', desc: 'Simple POST endpoint. Validate license + HWID in one call. Any language works.' },
      { icon: Zap, title: 'Per-license rate limits', desc: 'Configurable validations per minute (1–100) per license.' },
      { icon: Shield, title: 'IP rate limiting', desc: 'Protect the API from brute force and DDoS.' },
    ],
  },
  {
    title: 'Security & monitoring',
    items: [
      { icon: Bell, title: 'Rate limit alerts', desc: 'Per-app security tab. Alerts when licenses hit abuse thresholds.' },
      { icon: Lock, title: 'Auto-suspend option', desc: 'Optionally auto-suspend licenses when abuse is detected.' },
      { icon: BarChart3, title: 'Usage tracking', desc: 'Per-license and per-app API call counts. Monthly dashboard.' },
    ],
  },
  {
    title: 'Team & distribution',
    items: [
      { icon: Users, title: 'Collaborators', desc: 'Invite developers with full access to apps and licenses.' },
      { icon: Users, title: 'Partners', desc: 'Invite distribution partners with license creation access.' },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1">
        <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold">Features</h1>
            <p className="text-muted-foreground mt-2">
              Everything you need to manage software licenses securely.
            </p>
          </div>

          <div className="space-y-12">
            {FEATURE_GROUPS.map((group) => (
              <div key={group.title}>
                <h2 className="text-xl font-semibold mb-6 border-b pb-2">{group.title}</h2>
                <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Card key={item.title} className="hover:border-primary/30 transition-colors">
                        <CardContent className="flex gap-4 p-6">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-medium mb-1">{item.title}</h3>
                            <p className="text-sm text-muted-foreground">{item.desc}</p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

        </div>
      </main>
      <Footer />
    </div>
  );
}
