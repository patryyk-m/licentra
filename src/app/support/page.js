'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Footer from '@/components/layout/Footer';
import { HelpCircle, BookOpen, CreditCard, Mail, Sparkles } from 'lucide-react';

const FAQS = [
  {
    q: 'How do I integrate license validation?',
    a: 'Use the Validate API. See the',
    link: '/docs',
    linkText: 'documentation',
    aSuffix: ' for the endpoint, request format and code examples.',
  },
  {
    q: 'Where do I get my app ID and API secret?',
    a: 'Dashboard → Apps → select your app → Credentials tab. Generate or copy your API secret there.',
  },
  {
    q: 'What is HWID and when do I need it?',
    a: 'HWID is a device identifier. Pass it when validating if your license has device binding enabled. Licentra stores it and enforces the device limit.',
  },
  {
    q: 'I get license_not_found or invalid credentials',
    a: 'Check app ID, API secret and license key. Ensure the key exists for that app and the secret matches the one in App Credentials.',
  },
  {
    q: 'I get 429 on validate',
    a: 'You may have hit your plan’s monthly validate quota, or the server is temporarily throttling. Wait a bit and retry. If it persists, check Billing for quota or contact support.',
  },
  {
    q: 'Can I switch plans at any time?',
    a: 'Yes. Upgrades are immediate. Downgrades take effect at the next billing cycle.',
  },
  {
    q: 'Do you offer refunds?',
    a: 'Paid plans include a 30 day money back guarantee.',
  },
];

export default function SupportPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1">
        <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold">Support</h1>
            <p className="text-muted-foreground mt-2">
              Find answers and get help.
            </p>
          </div>

          <section className="mb-12">
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 mb-8">
              <Link href="/docs">
                <Card className="h-full hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <BookOpen className="w-8 h-8 text-primary mb-2" />
                    <CardTitle className="text-base">Documentation</CardTitle>
                    <CardDescription>API reference and integration guide</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
              <Link href="/features">
                <Card className="h-full hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <Sparkles className="w-8 h-8 text-primary mb-2" />
                    <CardTitle className="text-base">Features</CardTitle>
                    <CardDescription>What Licentra offers</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
              <Link href="/pricing">
                <Card className="h-full hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <CreditCard className="w-8 h-8 text-primary mb-2" />
                    <CardTitle className="text-base">Pricing</CardTitle>
                    <CardDescription>Plans, limits and billing</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
              <a href="#faq">
                <Card className="h-full hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <HelpCircle className="w-8 h-8 text-primary mb-2" />
                    <CardTitle className="text-base">FAQ</CardTitle>
                    <CardDescription>Common questions below</CardDescription>
                  </CardHeader>
                </Card>
              </a>
            </div>
          </section>

          <section id="faq" className="mb-12 scroll-mt-8">
            <h2 className="text-2xl font-semibold mb-6">Frequently asked questions</h2>
            <div className="space-y-4">
              {FAQS.map((faq) => (
                <Card key={faq.q}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{faq.q}</CardTitle>
                    <CardDescription className="mt-2">
                      {faq.a}
                      {faq.link && faq.linkText ? (
                        <>
                          {' '}
                          <Link href={faq.link} className="underline hover:text-primary">
                            {faq.linkText}
                          </Link>
                        </>
                      ) : null}
                      {faq.aSuffix || ''}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <Card>
              <CardHeader>
                <Mail className="w-8 h-8 text-primary mb-2" />
                <CardTitle>Contact</CardTitle>
                <CardDescription>
                  Need help? Reach out at{' '}
                  <a href="mailto:licentra.support@gmail.com" className="underline hover:text-primary">
                    licentra.support@gmail.com
                  </a>
                  . We respond within 24–48 hours on business days.
                </CardDescription>
              </CardHeader>
            </Card>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
