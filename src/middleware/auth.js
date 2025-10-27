import { verifyAccessToken } from '../lib/jwt.js';
import { getAuthCookies } from '../lib/cookies.js';
import User from '../models/User.js';

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

    return {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
    };
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

