'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Footer from '@/components/layout/Footer';
import {
  PLAN_LIMITS,
  getPlanLimits,
  getPlanMonthlyValidateQuota,
  getValidationsPerMinutePerApp,
} from '@/lib/plan-limits';
import { toast } from 'sonner';
import { performStepUp, isStepUpRequired } from '@/lib/step-up';

const formatMonthlyQuota = (value) => {
  if (!Number.isFinite(value) || value < 0) return 'Unlimited validate API calls / month';
  return `${value.toLocaleString()} validate API calls / month`;
};

const COMMON_PLAN_FEATURES = [
  'up to 100 requests per minute',
  'Usage analytics and security monitoring',
  'Custom license formats',
];

const formatPerAppRateLimit = (value) => {
  if (!Number.isFinite(value) || value < 0) return 'Unlimited validate requests / minute per app';
  return `${value.toLocaleString()} validate requests / minute per app`;
};

const getPlanLimitFeatures = (planId) => {
  const limits = getPlanLimits(planId);
  return [
    formatLimit(limits.apps ?? PLAN_LIMITS.free.apps, 'application'),
    formatLimit(limits.collaborators ?? PLAN_LIMITS.free.collaborators, 'collaborator'),
    formatLimit(limits.partners ?? PLAN_LIMITS.free.partners, 'partner'),
    `${formatMonthlyQuota(getPlanMonthlyValidateQuota(planId))}`,
    formatPerAppRateLimit(getValidationsPerMinutePerApp(planId)),
  ];
};

const PLAN_CARDS = [
  {
    id: 'free',
    name: 'Basic',
    description: 'Perfect for getting started.',
    monthly: 0,
    annual: 0,
    highlight: false,
    badge: null,
    ctaLabel: 'Get started',
    ctaHref: '/dashboard',
    ctaVariant: 'outline',
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For teams.',
    monthly: 15,
    annual: 12,
    badge: 'Most popular',
    highlight: true,
    ctaLabel: 'Start free trial',
    ctaHref: '/register',
    includesTrial: true,
  },
  {
    id: 'business',
    name: 'Business',
    description: 'For businesses.',
    monthly: 30,
    annual: 24,
    badge: null,
    highlight: false,
    ctaLabel: 'Get started',
    ctaHref: '/register?plan=business',
    includesTrial: false,
  },
];

const FAQS = [
  {
    question: 'Can I switch plans at any time?',
    answer: 'Yes. Upgrades are immediate and downgrades take effect at the next cycle.',
  },
  {
    question: 'Do you offer refunds?',
    answer: 'All paid plans include a 30 day money back guarantee. If Licentra is not the right fit, let us know and we will refund you.',
  },
  {
    question: 'Is there a free trial?',
    answer: 'Pro includes a 7 day free trial for new customers only. You can test the workflow before paying.',
  },
  {
    question: 'What happens if I exceed my limits?',
    answer: 'When your monthly plan quota is reached, validations are blocked and the app is suspended until the new month starts or Licentra support restores access.',
  },
];

const formatLimit = (value, noun) => {
  if (value < 0) {
    return `Unlimited ${noun}${noun.endsWith('s') ? '' : 's'}`;
  }

  const pluralized = value === 1 ? noun : `${noun}s`;
  return `Up to ${value} ${pluralized}`;
};

export default function PricingPage() {
  const router = useRouter();
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [userPlan, setUserPlan] = useState(null);
  const [currentBillingCycle, setCurrentBillingCycle] = useState(null);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [isPlanLoading, setIsPlanLoading] = useState(true);
  const [processingPlanId, setProcessingPlanId] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetchPlan = async () => {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
        if (!response.ok) {
          if (response.status === 401 && isMounted) {
            setUserPlan(null);
            setIsLoggedIn(false);
            setCurrentBillingCycle(null);
            setHasSubscription(false);
            setUserRole(null);
          }
          return;
        }

        const result = await response.json();
        const plan = result?.data?.user?.plan;
        const role = result?.data?.user?.role;
        const subscriptionId = result?.data?.user?.subscription?.stripeSubscriptionId;
        if (isMounted && typeof plan === 'string') {
          setUserPlan(plan.toLowerCase());
          setIsLoggedIn(true);
          setHasSubscription(!!subscriptionId && plan !== 'free');
          setUserRole(typeof role === 'string' ? role.toLowerCase() : null);
          
          // fetch billing cycle if user has subscription
          if (plan !== 'free' && subscriptionId) {
            try {
              const billingResponse = await fetch('/api/billing/info', { credentials: 'include', cache: 'no-store' });
              const billingResult = await billingResponse.json();
              if (billingResult.success && billingResult.data?.billingCycle) {
                setCurrentBillingCycle(billingResult.data.billingCycle);
                // set billing cycle toggle to match current
                setBillingCycle(billingResult.data.billingCycle);
              }
            } catch (error) {
              console.error('billing info fetch error:', error);
            }
          }
        }
      } catch (error) {
        console.error('pricing plan fetch error:', error);
        if (isMounted) {
          setUserPlan(null);
          setIsLoggedIn(false);
          setCurrentBillingCycle(null);
          setHasSubscription(false);
          setUserRole(null);
        }
      } finally {
        if (isMounted) {
          setIsPlanLoading(false);
        }
      }
    };

    fetchPlan();

    return () => {
      isMounted = false;
    };
  }, []);

  const formattedPlans = useMemo(() => {
    const normalizedPlan = typeof userPlan === 'string' ? userPlan.toLowerCase() : null;
    // check if user has existing subscription (not eligible for trial)
    // use hasSubscription state which is more reliable
    const hasExistingSubscription = hasSubscription || (isLoggedIn && normalizedPlan && normalizedPlan !== 'free');

    return PLAN_CARDS.map((plan) => {
      // check if this is the current plan AND billing cycle matches
      const isCurrentPlan = isLoggedIn && plan.id === normalizedPlan;
      const isCurrentBillingCycle = currentBillingCycle ? billingCycle === currentBillingCycle : false;
      const isCurrent = isCurrentPlan && (plan.id === 'free' || isCurrentBillingCycle);
      
      const badgeLabel = isCurrent ? 'Active plan' : plan.badge;
      // if same plan but different billing cycle, show action button, not "Current plan"
      let buttonLabel;
      if (isCurrent) {
        // plan and billing cycle both match, show current plan
        buttonLabel = 'Current plan';
      } else if (isCurrentPlan && plan.id !== 'free') {
        // same plan, but need to check billing cycle
        if (currentBillingCycle) {
          // we know the current billing cycle
          if (currentBillingCycle === 'monthly' && billingCycle === 'annual') {
            buttonLabel = 'Switch to annual';
          } else if (currentBillingCycle === 'annual' && billingCycle === 'monthly') {
            buttonLabel = 'Switch to monthly';
          } else {
            // billing cycles match, should have been caught by isCurrent, but show current plan
            buttonLabel = 'Current plan';
          }
        } else {
          // currentBillingCycle not loaded yet, but user has this plan, show current plan
          buttonLabel = 'Current plan';
        }
      } else {
        // different plan or not logged in
        if (userRole === 'partner') {
          buttonLabel = 'Partner account';
        } else if (hasExistingSubscription && plan.ctaLabel === 'Start free trial') {
          // user has subscription, don't show "Start free trial"
          buttonLabel = 'Get started';
        } else {
          buttonLabel = plan.ctaLabel;
        }
      }
      const features = [...getPlanLimitFeatures(plan.id), ...COMMON_PLAN_FEATURES];

      // determine if trial should be shown (only for pro, monthly, and new customers)
      // only show trial if we've confirmed user has no subscription (not still loading)
      const showTrial = !isPlanLoading && 
                        plan.includesTrial && 
                        plan.id === 'pro' && 
                        billingCycle === 'monthly' && 
                        !hasExistingSubscription;

      if (plan.monthly === 0) {
        return {
          ...plan,
          isCurrent,
          badgeLabel,
          buttonLabel,
          features,
          displayPrice: 'Free',
          billedText: 'Forever free',
          showTrial: false,
          shouldDisableButton: isCurrent,
        };
      }

      const isAnnual = billingCycle === 'annual';
      const price = isAnnual ? plan.annual : plan.monthly;
      const billedText = isAnnual
        ? `$${(plan.annual * 12).toLocaleString()} billed annually`
        : 'Billed monthly';

      // also check if billing cycles match (for button disabled state)
      // if user has this plan, disable button if billing cycles match OR if billing cycle not loaded yet
      const billingCyclesMatch = currentBillingCycle ? billingCycle === currentBillingCycle : false;
      const shouldDisableButton =
        isCurrent ||
        userRole === 'partner' ||
        (isCurrentPlan && plan.id !== 'free' && (billingCyclesMatch || !currentBillingCycle));

      return {
        ...plan,
        isCurrent,
        badgeLabel,
        buttonLabel,
        features,
        displayPrice: `$${price}`,
        billedText,
        showTrial,
        shouldDisableButton,
      };
    });
  }, [billingCycle, userPlan, userRole, isLoggedIn, currentBillingCycle, hasSubscription, isPlanLoading]);

  const handlePlanClick = async (planId, planHref) => {
    if (userRole === 'partner') {
      toast.error('switch to a developer account to change plans');
      return;
    }
    // if user is not authenticated, redirect to register
    if (!isLoggedIn) {
      if (planId === 'pro') {
        router.push('/register?plan=pro');
      } else if (planId === 'business') {
        router.push('/register?plan=business');
      } else {
        router.push(planHref);
      }
      return;
    }

    // if user is authenticated and clicking on paid plan
    if (planId === 'pro' || planId === 'business') {
      setProcessingPlanId(planId);
      try {
        // check if user already has a subscription
        const userResponse = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
        const userResult = await userResponse.json();
        const hasSubscription = userResult.success && 
          userResult.data?.user?.subscription?.stripeSubscriptionId &&
          userResult.data?.user?.plan !== 'free';

        if (hasSubscription) {
          // user has existing subscription, check if they want to change plan or billing cycle
          const currentPlan = userResult.data?.user?.plan;
          const isSamePlan = currentPlan === planId;
          
          if (isSamePlan) {
            // same plan, check if they want to change billing cycle
            // fetch current billing cycle from billing info
            const billingResponse = await fetch('/api/billing/info', { credentials: 'include', cache: 'no-store' });
            const billingResult = await billingResponse.json();
            const currentBillingCycle = billingResult.success && billingResult.data?.billingCycle 
              ? billingResult.data.billingCycle 
              : 'monthly';
            
            if (currentBillingCycle !== billingCycle) {
              // change billing cycle
              let response = await fetch('/api/stripe/change-billing-cycle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ billingCycle }),
              });
              let result = await response.json();
              if (isStepUpRequired(response, result)) {
                if (!(await performStepUp())) {
                  setProcessingPlanId(null);
                  return;
                }
                response = await fetch('/api/stripe/change-billing-cycle', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ billingCycle }),
                });
                result = await response.json();
              }

              if (result.success) {
                toast.success(`switched to ${billingCycle} billing`);
                setTimeout(() => {
                  window.location.reload();
                }, 1000);
              } else {
                toast.error(result.message || 'failed to change billing cycle');
                setProcessingPlanId(null);
              }
              return;
            } else {
              // same plan and same billing cycle, do nothing
              toast.info('you are already on this plan and billing cycle');
              setProcessingPlanId(null);
              return;
            }
          } else {
            // different plan,use change-plan endpoint
            let response = await fetch('/api/stripe/change-plan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ targetPlan: planId }),
            });
            let result = await response.json();
            if (isStepUpRequired(response, result)) {
              if (!(await performStepUp())) {
                setProcessingPlanId(null);
                return;
              }
              response = await fetch('/api/stripe/change-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ targetPlan: planId }),
              });
              result = await response.json();
            }

            if (result.success) {
              toast.success(`plan updated to ${planId}`);
              setTimeout(() => {
                window.location.reload();
              }, 1000);
            } else {
              toast.error(result.message || 'failed to change plan');
              setProcessingPlanId(null);
            }
            return;
          }
        } else {
          // no existing subscription, create checkout
          const response = await fetch('/api/stripe/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
              plan: planId,
              billingCycle: billingCycle,
            }),
          });

          const result = await response.json();

          if (result.success && result.data?.url) {
            // redirect to stripe checkout
            window.location.href = result.data.url;
          } else {
            toast.error(result.message || 'failed to create checkout session');
            setProcessingPlanId(null);
          }
        }
      } catch (error) {
        console.error('plan change error:', error);
        toast.error('network error. failed to process request');
        setProcessingPlanId(null);
      }
    } else {
      // free plan or other, use href
      router.push(planHref);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1">
        <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold">Pricing</h1>
            <p className="text-muted-foreground mt-2">
            </p>
            {userRole === 'partner' && (
              <p className="text-xs text-muted-foreground mt-1">
                you are signed in with a partner account. switch to a developer account to manage billing and plans.
              </p>
            )}
          </div>
          <div className="mb-8 inline-flex items-center gap-1 p-1 rounded-full border bg-muted">
            {['monthly', 'annual'].map((cycle) => (
              <button
                key={cycle}
                type="button"
                onClick={() => setBillingCycle(cycle)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition ${
                  billingCycle === cycle ? 'bg-background shadow text-foreground' : 'text-muted-foreground'
                }`}
              >
                {cycle === 'monthly' ? 'Monthly' : 'Annual · save 20%'}
              </button>
            ))}
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-3 items-stretch">
            {formattedPlans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex h-full flex-col rounded-3xl border bg-card p-8 shadow-sm transition hover:shadow-lg ${
                  plan.highlight ? 'border-primary shadow-primary/20' : ''
                }`}
              >
                {plan.badgeLabel && (
                  <span
                    className={`absolute -top-4 left-8 px-4 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
                      plan.highlight ? 'bg-primary text-white' : 'bg-muted text-foreground'
                    }`}
                  >
                    {plan.badgeLabel}
                  </span>
                )}
                <div className="flex flex-col flex-1">
                  <div className="mt-2">
                    <h3 className="text-2xl font-semibold">{plan.name}</h3>
                    <p className="text-muted-foreground mt-2">{plan.description}</p>
                  </div>
                  <div className="mt-8 flex items-baseline gap-2">
                    <span className="text-5xl font-bold">{plan.displayPrice}</span>
                    {plan.monthly !== 0 && <span className="text-muted-foreground">/month</span>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{plan.billedText}</p>
                  <div className="mt-2">
                    {plan.showTrial ? (
                      <p className="text-sm font-medium text-primary">
                        7-day free trial · no card required
                      </p>
                    ) : (
                      <p
                        aria-hidden="true"
                        className="text-sm font-medium text-primary invisible select-none pointer-events-none"
                      >
                        7-day free trial · no card required
                      </p>
                    )}
                  </div>

                  <ul className="mt-8 space-y-3 text-sm flex-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="w-4 h-4 mt-1 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8">
                    <Button
                      variant={plan.highlight ? 'default' : plan.ctaVariant || 'outline'}
                      disabled={(plan.isCurrent || plan.shouldDisableButton) || isPlanLoading || processingPlanId !== null}
                      className="w-full justify-center text-center"
                      onClick={() => !plan.isCurrent && !plan.shouldDisableButton && handlePlanClick(plan.id, plan.ctaHref)}
                    >
                      {plan.isCurrent ? (
                        <span>{plan.buttonLabel}</span>
                      ) : processingPlanId === plan.id ? (
                        <span>Processing...</span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          {plan.buttonLabel}
                          <ArrowRight className="w-4 h-4" />
                        </span>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <section className="py-12 px-4 sm:px-6 lg:px-8 bg-background border-t">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-semibold mb-2">Launch faster with Licentra</h2>
            <p className="text-muted-foreground mb-6">
              Get help getting started. We&apos;ll set you up and answer any questions.
            </p>
            <Button asChild size="lg">
              <Link href="/support">Contact support</Link>
            </Button>
          </div>
        </section>

        <section className="py-12 px-4 sm:px-6 lg:px-8 bg-background">
          <div className="max-w-6xl mx-auto">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold">Frequently asked questions</h2>
              <p className="text-muted-foreground mt-2">
                Still unsure? Reach out and we will help you model the right plan for your growth.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {FAQS.map((faq) => (
                <div key={faq.question} className="p-6 rounded-2xl border bg-card shadow-sm">
                  <h3 className="text-lg font-semibold">{faq.question}</h3>
                  <p className="text-muted-foreground mt-3">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}


