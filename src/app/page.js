'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { Check, Key, Shield, Zap, Terminal } from 'lucide-react';

export default function Home() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      const result = await response.json();
      if (result.success) {
        setUser(result.data.user);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
          <div className="max-w-5xl mx-auto text-center relative z-10">
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight mb-6">
              License Management
              <br />
              <span className="text-primary">Made Simple</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-10 max-w-3xl mx-auto">
              Generate and validate license keys for your software with a powerful API and intuitive dashboard.
              Built for developers who value simplicity and security.
            </p>

            {!user ? (
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <Button asChild size="lg" className="text-lg px-10 h-12">
                  <Link href="/register">Get Started Free</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="text-lg px-10 h-12">
                  <Link href="/login">Sign In</Link>
                </Button>
              </div>
            ) : (
              <div className="flex justify-center mb-12">
                <Button asChild size="lg" className="text-lg px-10 h-12">
                  <Link href="/dashboard">Go to Dashboard</Link>
                </Button>
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-primary" />
                <span>Free to start</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-primary" />
                <span>No credit card</span>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold mb-4">Everything You Need</h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                All the tools you need to manage software licenses efficiently
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="p-8 rounded-xl border bg-card hover:shadow-lg transition-all">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Key className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Generate License Keys</h3>
                <p className="text-muted-foreground">
                  Create license keys.
                </p>
              </div>
              
              <div className="p-8 rounded-xl border bg-card hover:shadow-lg transition-all">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Secure Validation</h3>
                <p className="text-muted-foreground">
                  License validation.
                </p>
              </div>
              
              <div className="p-8 rounded-xl border bg-card hover:shadow-lg transition-all">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Terminal className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">RESTful API</h3>
                <p className="text-muted-foreground">
                  Simple REST API.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 px-4 sm:px-6 lg:px-8 bg-muted/30">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold mb-4">Simple Process</h2>
              <p className="text-xl text-muted-foreground">
                Get started in three easy steps
              </p>
            </div>
            
            <div className="space-y-12">
              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center font-bold text-2xl shadow-lg">
                  1
                </div>
                <div className="pt-2">
                  <h3 className="text-2xl font-semibold mb-2">Create Your Account</h3>
                  <p className="text-lg text-muted-foreground">
                    Sign up in seconds. No credit card required. Start with our free plan.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center font-bold text-2xl shadow-lg">
                  2
                </div>
                <div className="pt-2">
                  <h3 className="text-2xl font-semibold mb-2">Generate Licenses</h3>
                  <p className="text-lg text-muted-foreground">
                    Use our dashboard to create license keys with custom settings, durations and features.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center font-bold text-2xl shadow-lg">
                  3
                </div>
                <div className="pt-2">
                  <h3 className="text-2xl font-semibold mb-2">Validate in Your App</h3>
                  <p className="text-lg text-muted-foreground">
                    Call our validation API from your software to check license status in real time.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold mb-4">Why Choose Licentra?</h2>
              <p className="text-xl text-muted-foreground">
                Built with modern technologies for reliability and performance.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex gap-4">
                <Zap className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold mb-2">Lightning Fast</h4>
                  <p className="text-muted-foreground">
                    Fast validations.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <Shield className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold mb-2">Secure by Default</h4>
                  <p className="text-muted-foreground">
                    Military grade encryption for all sensitive data.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <Terminal className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold mb-2">Developer-First</h4>
                  <p className="text-muted-foreground">
                    Clean API.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <Check className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold mb-2">Affordable Pricing</h4>
                  <p className="text-muted-foreground">
                    Start free, scale as you grow. No hidden fees.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {!user && (
          <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-primary/5 to-transparent">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-5xl font-bold mb-6">
                Start Managing Licenses Today
              </h2>
              <p className="text-xl text-muted-foreground mb-10">
                Join thousands of developers using Licentra to secure their software
              </p>
              <Button asChild size="lg" className="text-lg px-10 h-12">
                <Link href="/register">Get Started — It's Free</Link>
              </Button>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
