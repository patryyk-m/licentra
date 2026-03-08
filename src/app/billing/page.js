'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CheckCircle, XCircle, CreditCard, Calendar, AlertCircle, Loader2, Package, ArrowUpDown, Settings2, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { performStepUp, isStepUpRequired } from '@/lib/step-up';

function BillingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [billingData, setBillingData] = useState(null);
  const [processingAction, setProcessingAction] = useState(null); // track which action is processing
  const success = searchParams.get('success');

  const fetchBillingData = useCallback(async () => {
    try {
      const response = await fetch('/api/billing/info', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('failed to fetch billing data');
      }

      const result = await response.json();
      if (result.success && result.data) {
        setBillingData(result.data);
      }
    } catch (error) {
      console.error('error fetching billing data:', error);
      toast.error('failed to load billing information');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchBillingData();

    // if success, poll for updates
    if (success === '1') {
      const pollInterval = setInterval(() => {
        fetchBillingData();
      }, 2000);

      const timeout = setTimeout(() => {
        clearInterval(pollInterval);
      }, 30000);

      return () => {
        clearInterval(pollInterval);
        clearTimeout(timeout);
      };
    }
  }, [fetchBillingData, success]);

  const handleChangePlan = async (targetPlan) => {
    if (processingAction) return;

    const currentPlan = billingData?.plan;
    const isUpgrade = currentPlan === 'pro' && targetPlan === 'business';
    const isDowngrade = currentPlan === 'business' && targetPlan === 'pro';

    // show confirmation for upgrades
    if (isUpgrade) {
      const confirmed = confirm(
        'upgrade to business plan?\n\n' +
        'your pro plan will be canceled immediately and you will be upgraded to business plan right away.\n\n' +
        'do you want to continue?'
      );
      if (!confirmed) return;
    }

    // show info for downgrades
    if (isDowngrade) {
      const confirmed = confirm(
        'schedule downgrade to pro plan?\n\n' +
        'you will keep your business plan features until the end of your current billing period.\n' +
        'your plan will automatically switch to pro when your current period ends.\n\n' +
        'do you want to continue?'
      );
      if (!confirmed) return;
    }

    setProcessingAction('changePlan');
    try {
      let response = await fetch('/api/stripe/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetPlan }),
      });
      let result = await response.json();
      if (isStepUpRequired(response, result)) {
        if (!(await performStepUp())) {
          setProcessingAction(null);
          return;
        }
        response = await fetch('/api/stripe/change-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ targetPlan }),
        });
        result = await response.json();
      }

      if (result.success) {
        if (result.data?.isUpgrade) {
          toast.success('upgraded to business plan successfully!');
        } else if (result.data?.isDowngrade) {
          const scheduledDate = result.data.scheduledDate 
            ? new Date(result.data.scheduledDate).toLocaleDateString()
            : 'end of billing period';
          toast.success(`downgrade scheduled. you will switch to pro on ${scheduledDate}`);
        } else {
          toast.success(`plan updated to ${targetPlan}`);
        }
        // wait a moment for webhook, then refresh
        setTimeout(() => {
          fetchBillingData();
        }, 2000);
      } else {
        toast.error(result.message || 'failed to change plan');
      }
    } catch (error) {
      console.error('error changing plan:', error);
      toast.error('network error. failed to change plan');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleCancelSubscription = async () => {
    const cancelDate = nextBillingDate 
      ? nextBillingDate.toLocaleDateString()
      : 'end of billing period';
    
    let confirmMessage = `cancel subscription?\n\n`;
    if (scheduledBillingCycleChange) {
      confirmMessage += `this will cancel your subscription and the scheduled billing cycle change to ${scheduledBillingCycleChange}.\n\n`;
    }
    confirmMessage += `your subscription will remain active until ${cancelDate}.\n` +
      `you will keep all features until then and will not be billed again.\n` +
      `after ${cancelDate}, your account will be downgraded to free.\n\n` +
      `do you want to continue?`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    if (processingAction) return;

    setProcessingAction('cancel');
    try {
      let response = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        credentials: 'include',
      });
      let result = await response.json();
      if (isStepUpRequired(response, result)) {
        if (!(await performStepUp())) {
          setProcessingAction(null);
          return;
        }
        response = await fetch('/api/stripe/cancel-subscription', {
          method: 'POST',
          credentials: 'include',
        });
        result = await response.json();
      }

      if (result.success) {
        toast.success(`subscription will be canceled on ${cancelDate}. you will keep access until then.`);
        fetchBillingData();
      } else {
        toast.error(result.message || 'failed to cancel subscription');
      }
    } catch (error) {
      console.error('error canceling subscription:', error);
      toast.error('network error. failed to cancel subscription');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleChangeBillingCycle = async (targetCycle) => {
    if (processingAction) return;

    const confirmed = confirm(
      `switch to ${targetCycle} billing?\n\n` +
      `your billing cycle will change to ${targetCycle} at the end of your current billing period.\n\n` +
      `you will keep your current plan until then.\n\n` +
      `do you want to continue?`
    );
    if (!confirmed) return;

    setProcessingAction('changeBillingCycle');
    try {
      let response = await fetch('/api/stripe/change-billing-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ billingCycle: targetCycle }),
      });
      let result = await response.json();
      if (isStepUpRequired(response, result)) {
        if (!(await performStepUp())) {
          setProcessingAction(null);
          return;
        }
        response = await fetch('/api/stripe/change-billing-cycle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ billingCycle: targetCycle }),
        });
        result = await response.json();
      }

      if (result.success) {
        toast.success(`billing cycle will switch to ${targetCycle} at the end of your current period`);
        setTimeout(() => {
          fetchBillingData();
        }, 2000);
      } else {
        toast.error(result.message || 'failed to change billing cycle');
      }
    } catch (error) {
      console.error('error changing billing cycle:', error);
      toast.error('network error. failed to change billing cycle');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleOpenPortal = async () => {
    if (processingAction) return;

    setProcessingAction('portal');
    try {
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        credentials: 'include',
      });

      const result = await response.json();

      if (result.success && result.data?.url) {
        window.location.href = result.data.url;
      } else {
        toast.error(result.message || 'failed to open billing portal');
        setProcessingAction(null);
      }
    } catch (error) {
      console.error('error opening portal:', error);
      toast.error('network error. failed to open billing portal');
      setProcessingAction(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!billingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">failed to load billing data</p>
      </div>
    );
  }

  const { plan, subscription, billingCycle, scheduledBillingCycleChange } = billingData;
  const status = subscription?.status;
  const currentPeriodEnd = subscription?.currentPeriodEnd;
  const cancelAtPeriodEnd = subscription?.cancelAtPeriodEnd || false;
  const hasActiveSubscription = plan !== 'free' && subscription?.stripeSubscriptionId;
  const currentBillingCycle = billingCycle || 'monthly';

  // calculate if in trial (pro plan with trialing status)
  const isTrialing = plan === 'pro' && status === 'trialing';
  const nextBillingDate = currentPeriodEnd ? new Date(currentPeriodEnd) : null;

  // show success message if redirected from checkout
  if (success === '1') {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <CardTitle>Subscription Activated</CardTitle>
              </div>
              <CardDescription>
                your subscription has been successfully activated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                {plan && plan !== 'free'
                  ? `you are now on the ${plan} plan.`
                  : 'your subscription is being processed. please wait a moment for it to activate.'}
              </p>
              <div className="flex gap-4">
                <Button onClick={() => window.location.reload()}>refresh</Button>
                <Button variant="outline" asChild>
                  <Link href="/dashboard">go to dashboard</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Billing</h1>
          <p className="text-muted-foreground mt-2">manage your subscription and billing</p>
        </div>

        <div className="space-y-6">

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Current Plan
              </CardTitle>
              <CardDescription>your active subscription plan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-semibold capitalize">{plan}</p>
                  {status && (
                    <p className="text-sm text-muted-foreground capitalize mt-1">
                      status: {status === 'trialing' ? 'trial' : status}
                      {cancelAtPeriodEnd && ' (canceling at period end)'}
                    </p>
                  )}
                </div>
                {plan === 'free' && (
                  <Button asChild>
                    <Link href="/pricing">
                      <ArrowUpRight className="w-4 h-4 mr-2" />
                      upgrade plan
                    </Link>
                  </Button>
                )}
              </div>

              {isTrialing && nextBillingDate && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <Calendar className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-primary">7-day free trial active</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      trial ends: {nextBillingDate.toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {hasActiveSubscription && nextBillingDate && !isTrialing && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted">
                  <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">next billing date</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {nextBillingDate.toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {cancelAtPeriodEnd && scheduledBillingCycleChange && nextBillingDate && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-600">billing cycle change scheduled</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      your billing cycle will change to {scheduledBillingCycleChange} on {nextBillingDate.toLocaleDateString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      note: this scheduled change is handled automatically by our system. stripe billing portal will only show the current subscription canceling.
                    </p>
                  </div>
                </div>
              )}

              {cancelAtPeriodEnd && !scheduledBillingCycleChange && nextBillingDate && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-600">subscription will cancel</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      your subscription will end on {nextBillingDate.toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {hasActiveSubscription && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpDown className="w-5 h-5" />
                  Billing Cycle
                </CardTitle>
                <CardDescription>switch between monthly and annual billing</CardDescription>
              </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                <div>
                  <p className="font-medium">current billing cycle</p>
                  <p className="text-sm text-muted-foreground mt-1 capitalize">
                    {currentBillingCycle} billing
                  </p>
                </div>
                <Button
                  onClick={() => handleChangeBillingCycle(currentBillingCycle === 'monthly' ? 'annual' : 'monthly')}
                  disabled={processingAction !== null}
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  {processingAction === 'changeBillingCycle' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      processing...
                    </>
                  ) : (
                    `switch to ${currentBillingCycle === 'monthly' ? 'annual' : 'monthly'}`
                  )}
                </Button>
              </div>
              </CardContent>
            </Card>
          )}

          {hasActiveSubscription && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="w-5 h-5" />
                  Manage Subscription
                </CardTitle>
                <CardDescription>change your plan or cancel your subscription</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {plan === 'pro' && (
                  <div>
                    <p className="text-sm font-medium mb-2">upgrade to business</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      your pro plan will be canceled and you will be upgraded immediately
                    </p>
                    <Button
                      onClick={() => handleChangePlan('business')}
                      disabled={processingAction !== null}
                      className="w-full sm:w-auto"
                    >
                      {processingAction === 'changePlan' ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          processing...
                        </>
                      ) : (
                        <>
                          <ArrowUpRight className="w-4 h-4 mr-2" />
                          upgrade to business
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {plan === 'business' && (
                  <div>
                    <p className="text-sm font-medium mb-2">downgrade to pro</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      you will keep business features until {nextBillingDate ? nextBillingDate.toLocaleDateString() : 'end of billing period'}, then switch to pro
                    </p>
                    <Button
                      onClick={() => handleChangePlan('pro')}
                      disabled={processingAction !== null}
                      variant="outline"
                      className="w-full sm:w-auto"
                    >
                      {processingAction === 'changePlan' ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          processing...
                        </>
                      ) : (
                        'schedule downgrade to pro'
                      )}
                    </Button>
                  </div>
                )}

                {(!cancelAtPeriodEnd || scheduledBillingCycleChange) && (
                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium mb-2 text-destructive">cancel subscription</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      {scheduledBillingCycleChange 
                        ? `canceling will cancel your subscription and the scheduled billing cycle change. your subscription will continue until ${nextBillingDate ? nextBillingDate.toLocaleDateString() : 'end of billing period'}. you will not be billed again and will keep all features until then.`
                        : `your subscription will continue until ${nextBillingDate ? nextBillingDate.toLocaleDateString() : 'end of billing period'}. you will not be billed again and will keep all features until then.`
                      }
                    </p>
                    <Button
                      onClick={handleCancelSubscription}
                      disabled={processingAction !== null}
                      variant="destructive"
                      className="w-full sm:w-auto"
                    >
                      {processingAction === 'cancel' ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          processing...
                        </>
                      ) : (
                        'cancel subscription'
                      )}
                    </Button>
                  </div>
                )}

                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">billing portal</p>
                  <p className="text-sm text-muted-foreground mb-3">
                    manage payment methods, view invoices, and update billing information
                  </p>
                  <Button
                    onClick={handleOpenPortal}
                    disabled={processingAction !== null}
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {processingAction === 'portal' ? 'opening...' : 'open billing portal'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <BillingContent />
    </Suspense>
  );
}
