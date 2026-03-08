import { verifyAccessToken } from '../lib/auth.js';
import { getAuthCookies } from '../lib/auth-cookies.js';
import User from '../models/User.js';
import { normalizeAuthUser } from '../lib/authz.js';
import { logSecurityEvent, SECURITY_EVENTS } from '../lib/security.js';

// Middleware to authenticate user from access token
export async function authenticateUser(req) {
  try {
    const { accessToken } = getAuthCookies(req);
    
    if (!accessToken) {
      return null;
    }

    const decoded = verifyAccessToken(accessToken);
    const user = await User.findById(decoded.id).select('-passwordHash').lean();
    
    if (!user) {
      return null;
    }

    if (user.status === 'suspended') {
      await logSecurityEvent(SECURITY_EVENTS.USER_BLOCKED_SUSPENDED, {
        userId: user._id?.toString(),
      }).catch(() => {});
      return null;
    }

    const normalized = normalizeAuthUser(user);

    const needsRoleUpdate = normalized.role && normalized.role !== user.role;

    if (needsRoleUpdate) {
      const $set = {};

      if (needsRoleUpdate) {
        $set.role = normalized.role;
      }

      const updatePayload = {};
      if (Object.keys($set).length > 0) {
        updatePayload.$set = $set;
      }

      if (Object.keys(updatePayload).length > 0) {
        await User.updateOne({ _id: user._id }, updatePayload).catch(() => {});
      }
    }

    return normalized;
  } catch (error) {
    return null;
  }
}

// Middleware to require authentication
export async function requireAuth(req, res) {
  const user = await authenticateUser(req);
  
  if (!user) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
    return null;
  }

  req.user = user;
  return user;
}

