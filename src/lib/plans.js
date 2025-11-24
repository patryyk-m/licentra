export const PLAN_COLLAB_LIMIT = {
  free: 1,
  pro: 3,
  business: 3,
};

export function getCollaboratorLimit(plan = 'free') {
  const normalized = typeof plan === 'string' ? plan.toLowerCase() : 'free';
  return PLAN_COLLAB_LIMIT[normalized] ?? PLAN_COLLAB_LIMIT.free;
}


