export const PLAN_LIMITS = {
  free: {
    apps: 3,
    collaborators: 1,
    partners: 1,
    monthlyValidateQuota: 150,
    validationsPerMinutePerApp: 500,
  },
  pro: {
    apps: -1, // unlimited
    collaborators: 3,
    partners: 5,
    monthlyValidateQuota: 3000,
    validationsPerMinutePerApp: 2000,
  },
  business: {
    apps: -1, // unlimited
    collaborators: 5,
    partners: -1, // unlimited
    monthlyValidateQuota: 10000,
    validationsPerMinutePerApp: 10000,
  },
};

function normalizePlan(plan = 'free') {
  const normalized = String(plan || 'free').toLowerCase();
  if (normalized === 'basic') return 'free';
  return normalized;
}

export function getPlanLimits(plan = 'free') {
  const normalized = normalizePlan(plan);
  return PLAN_LIMITS[normalized] ?? PLAN_LIMITS.free;
}

export function getPlanMonthlyValidateQuota(plan = 'free') {
  return getPlanLimits(plan).monthlyValidateQuota ?? PLAN_LIMITS.free.monthlyValidateQuota;
}

/** quota is always based on the app owner */
export function getEffectiveMonthlyQuota(plan = 'free', override = null) {
  if (override != null && Number.isFinite(override) && override >= 0) {
    return Math.floor(override);
  }
  return getPlanMonthlyValidateQuota(plan);
}

export function getCollaboratorLimit(plan = 'free') {
  return getPlanLimits(plan).collaborators ?? PLAN_LIMITS.free.collaborators;
}

export function getPartnerLimit(plan = 'free') {
  return getPlanLimits(plan).partners ?? PLAN_LIMITS.free.partners;
}

export function getAppLimit(plan = 'free') {
  return getPlanLimits(plan).apps ?? PLAN_LIMITS.free.apps;
}

/** per-app validate rate limit (all licenses combined per minute) used with checkAppRateLimit */
export function getValidationsPerMinutePerApp(plan = 'free') {
  const override = process.env.VALIDATIONS_PER_MINUTE_PER_APP_TEST;
  if (override !== undefined && override !== '') {
    const n = parseInt(override, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const v = getPlanLimits(plan).validationsPerMinutePerApp;
  return v == null ? PLAN_LIMITS.free.validationsPerMinutePerApp : v;
}

