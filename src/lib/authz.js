import { normalizeRole, ROLE } from './roles';
import { isPrivateIp } from './ssrf-protection';

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
  if (user.role === ROLE.ADMIN) return true;
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

