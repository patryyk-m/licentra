const licenseRateLimitMap = new Map();
const WINDOW_MS = 60 * 1000;

export function checkLicenseRateLimit(app, license) {
  const limit = Math.min(Math.max(Number(app.validationsPerMinutePerLicense) || 10, 1), 120);
  const key = `${app._id}:${license._id}`;
  const now = Date.now();

  let record = licenseRateLimitMap.get(key);
  if (!record || now > record.resetAt) {
    licenseRateLimitMap.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
    return { exceeded: false };
  }

  if (record.count >= limit) {
    return { exceeded: true, key };
  }

  record.count++;
  licenseRateLimitMap.set(key, record);
  return { exceeded: false };
}

export function cleanupLicenseRateLimit() {
  const now = Date.now();
  for (const [key, record] of licenseRateLimitMap.entries()) {
    if (now > record.resetAt) {
      licenseRateLimitMap.delete(key);
    }
  }
}

setInterval(cleanupLicenseRateLimit, 5 * 60 * 1000);
