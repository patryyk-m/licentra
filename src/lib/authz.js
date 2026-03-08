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

const toStringId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toString === 'function') return value.toString();
  return null;
};

const normalizeIdArray = (values) => {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => toStringId(value))
    .filter(Boolean);
};

export function normalizeAuthUser(input) {
  if (!input) return null;

  const id = toStringId(input.id || input._id);
  const developerApps = normalizeIdArray(input.developerApps);
  const partnerApps = normalizeIdArray(input.partnerApps);

  return {
    id,
    role: normalizeRole(input.role),
    email: input.email || '',
    username: input.username || '',
    plan: input.plan || 'free',
    developerApps,
    partnerApps,
  };
}

export function hasAppAccess(app, user) {
  if (!app || !user) return false;

  const appId = toStringId(app._id);
  const ownerId = toStringId(app.ownerId);

  if (!appId) return false;
  if (ownerId && ownerId === user.id) return true;
  if (user.developerApps?.includes(appId)) return true;
  if (user.partnerApps?.includes(appId)) return true;

  return false;
}

export function assertRole(user, allowedRoles = []) {
  const normalized = normalizeRole(user?.role);
  if (!allowedRoles.includes(normalized)) {
    const error = new Error('FORBIDDEN');
    error.status = 403;
    throw error;
  }
}

export function isAdmin(user) {
  if (!user) return false;
  return isAdminRole(user.role);
}

export function assertAdmin(user) {
  assertRole(user, [ROLE.ADMIN]);
}

