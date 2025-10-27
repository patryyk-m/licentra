// Set authentication cookies (access and refresh tokens)
export function setAuthCookies(res, accessToken, refreshToken) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
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
  };

  res.cookies.set('access_token', '', {
    ...cookieOptions,
    maxAge: 0,
  });

  res.cookies.set('refresh_token', '', {
    ...cookieOptions,
    maxAge: 0,
  });
}

// Get authentication tokens from cookies
export function getAuthCookies(req) {
  const accessToken = req.cookies.get('access_token')?.value || null;
  const refreshToken = req.cookies.get('refresh_token')?.value || null;
  
  return { accessToken, refreshToken };
}

