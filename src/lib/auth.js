import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT secrets must be defined in environment variables');
}

// hash using bcrypt
export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// verify password against hash
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// sign access token (15 minutes)
export function signAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: '15m',
  });
}

// sign refresh token (7 days)
export function signRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: '7d',
  });
}

// verify access token
export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, ACCESS_SECRET);
  } catch {
    throw new Error('Invalid access token');
  }
}

// verify refresh token
export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, REFRESH_SECRET);
  } catch {
    throw new Error('Invalid refresh token');
  }
}

// step up token (10 minutes, same secret as access tokens)
export function signStepUpToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: '10m',
  });
}

export function verifyStepUpToken(token) {
  try {
    return jwt.verify(token, ACCESS_SECRET);
  } catch {
    throw new Error('Invalid step up token');
  }
}
