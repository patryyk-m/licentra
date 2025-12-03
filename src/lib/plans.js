export const PLAN_LIMITS = {
  free: {
    collaborators: 1,
    partners: 1,
  },
  pro: {
    collaborators: 3,
    partners: 5,
  },
  business: {
    collaborators: 5,
    partners: -1, // unlimited
  },
};

function normalizePlan(plan = 'free') {
  return typeof plan === 'string' ? plan.toLowerCase() : 'free';
}

export function getPlanLimits(plan = 'free') {
  const normalized = normalizePlan(plan);
  return PLAN_LIMITS[normalized] ?? PLAN_LIMITS.free;
}

export function getCollaboratorLimit(plan = 'free') {
  return getPlanLimits(plan).collaborators ?? PLAN_LIMITS.free.collaborators;
}

export function getPartnerLimit(plan = 'free') {
  return getPlanLimits(plan).partners ?? PLAN_LIMITS.free.partners;
}

