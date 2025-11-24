export const ROLE = {
  DEVELOPER: 'developer',
  PARTNER: 'partner',
  ADMIN: 'admin',
};

const VALID_ROLES = new Set(Object.values(ROLE));

export function normalizeRole(role) {
  if (typeof role !== 'string') return ROLE.DEVELOPER;
  const normalized = role.trim().toLowerCase();
  return VALID_ROLES.has(normalized) ? normalized : ROLE.DEVELOPER;
}

export function isDeveloperRole(role) {
  return normalizeRole(role) === ROLE.DEVELOPER;
}

export function isPartnerRole(role) {
  return normalizeRole(role) === ROLE.PARTNER;
}

export function isAdminRole(role) {
  return normalizeRole(role) === ROLE.ADMIN;
}


