'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Cookie, Settings, X, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import {
  getCookieConsent,
  hasCookieConsent,
  saveCookieConsent,
  acceptAllCookies,
  rejectAllCookies,
  COOKIE_CATEGORIES,
} from '@/lib/cookie-consent';

export default function CookieConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [showCustomizeDialog, setShowCustomizeDialog] = useState(false);
  const [preferences, setPreferences] = useState(() => {
    const current = getCookieConsent();
    if (current) {
      return current;
    }
    return Object.keys(COOKIE_CATEGORIES).reduce((acc, key) => {
      acc[key] = COOKIE_CATEGORIES[key].required || false;
      return acc;
    }, {});
  });

  useEffect(() => {
    if (!hasCookieConsent()) {
      const timer = setTimeout(() => setShowBanner(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    acceptAllCookies();
    setShowBanner(false);
  };

  const handleRejectAll = () => {
    rejectAllCookies();
    setShowBanner(false);
  };

  const handleDismiss = () => {
    rejectAllCookies();
    setShowBanner(false);
  };

  const handleCustomize = () => {
    setShowCustomizeDialog(true);
  };

  const handleSaveCustomPreferences = () => {
    const success = saveCookieConsent(preferences);
    if (success) {
      setShowCustomizeDialog(false);
      setShowBanner(false);
    } else {
      alert('failed to save preferences. please try again.');
    }
  };

  const toggleCategory = (categoryId) => {
    if (categoryId === 'necessary') return;
    setPreferences((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  if (!showBanner) {
    return null;
  }

  return (
    <>
      <div 
        className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-lg"
        role="dialog"
        aria-label="cookie consent banner"
        aria-modal="false"
      >
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Cookie className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-sm md:text-base">we use cookies</h3>
                </div>
                <button
                  onClick={handleDismiss}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  aria-label="dismiss cookie banner and reject optional cookies"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                we use cookies to improve your experience and for analytics. click accept all to allow, or choose your preferences.{' '}
                <Link 
                  href="/settings?tab=privacy" 
                  className="text-primary hover:underline inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                  aria-label="learn more about cookie preferences"
                >
                  learn more
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRejectAll}
                className="flex-1 sm:flex-none min-w-[100px]"
                aria-label="reject all optional cookies"
              >
                reject all
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCustomize}
                className="flex-1 sm:flex-none min-w-[100px]"
                aria-label="customize cookie preferences"
              >
                <Settings className="w-4 h-4 mr-2" aria-hidden="true" />
                customize
              </Button>
              <Button
                size="sm"
                onClick={handleAcceptAll}
                className="flex-1 sm:flex-none min-w-[100px]"
                aria-label="accept all cookies"
              >
                accept all
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showCustomizeDialog} onOpenChange={setShowCustomizeDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              customize cookie preferences
            </DialogTitle>
            <DialogDescription>
              choose which cookies to allow. necessary cookies are always on so the site works. you can change this anytime in settings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {Object.values(COOKIE_CATEGORIES).map((category) => (
              <div
                key={category.id}
                className="flex items-start gap-4 p-4 rounded-lg border border-border bg-card"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor={`cookie-${category.id}`}
                      className="font-semibold cursor-pointer"
                    >
                      {category.name}
                    </Label>
                    {category.required && (
                      <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
                        required
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                </div>
                <Checkbox
                  id={`cookie-${category.id}`}
                  checked={preferences[category.id] || false}
                  onCheckedChange={() => toggleCategory(category.id)}
                  disabled={category.required}
                  className="mt-1"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 justify-end pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => {
                setShowCustomizeDialog(false);
                const current = getCookieConsent();
                if (current) setPreferences(current);
              }}
            >
              cancel
            </Button>
            <Button onClick={handleSaveCustomPreferences}>
              save preferences
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
