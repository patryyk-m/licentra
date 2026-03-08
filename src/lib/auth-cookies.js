import { verifyStepUpToken } from '@/lib/auth';

const STEP_UP_COOKIE = 'licentra_step_up';

// Set authentication cookies (access and refresh tokens)
export function setAuthCookies(res, accessToken, refreshToken) {
  // for local dev over http we must not set secure cookies
  const isProduction =
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PUBLIC_APP_URL &&
    process.env.NEXT_PUBLIC_APP_URL.startsWith('https://');
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    ...(isProduction && process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }),
  };

  // Set access token cookie (15 minutes)
  const maxAge = 15 * 60; // 15 minutes in seconds
  res.cookies.set('access_token', accessToken, {
    ...cookieOptions,
    maxAge,
  });

  // Set refresh token cookie (7 days)
  const refreshMaxAge = 7 * 24 * 60 * 60; // 7 days in seconds
  res.cookies.set('refresh_token', refreshToken, {
    ...cookieOptions,
    maxAge: refreshMaxAge,
  });
}

// Clear authentication cookies
export function clearAuthCookies(res) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
    ...(isProduction && process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }),
  };

  res.cookies.set('access_token', '', cookieOptions);
  res.cookies.set('refresh_token', '', cookieOptions);
  res.cookies.set(STEP_UP_COOKIE, '', cookieOptions);
}

// Get authentication tokens from cookies
export function getAuthCookies(req) {
  const accessToken = req.cookies.get('access_token')?.value || null;
  const refreshToken = req.cookies.get('refresh_token')?.value || null;
  return { accessToken, refreshToken };
}

export function getStepUpCookie(req) {
  return req.cookies.get(STEP_UP_COOKIE)?.value || null;
}

export async function requireStepUp(req, user) {
  const token = getStepUpCookie(req);
  if (!token || !user?.id) return false;

  try {
    const decoded = verifyStepUpToken(token);
    const subject = decoded.sub || decoded.id;
    if (!subject || String(subject) !== String(user.id)) return false;
    return true;
  } catch {
    return false;
  }
}
