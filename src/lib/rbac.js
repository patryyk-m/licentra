// Require specific roles for route access
export function requireRole(allowedRoles) {
  return (req, res, next) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Forbidden: insufficient permissions' 
      });
    }

    next();
  };
}

// Get current user from request
export function getCurrentUser(req) {
  return req.user || null;
}

