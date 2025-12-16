// SSRF Protection Utilities

export function isUrlSafe(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost and local IPs
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.20.') ||
      hostname.startsWith('172.21.') ||
      hostname.startsWith('172.22.') ||
      hostname.startsWith('172.23.') ||
      hostname.startsWith('172.24.') ||
      hostname.startsWith('172.25.') ||
      hostname.startsWith('172.26.') ||
      hostname.startsWith('172.27.') ||
      hostname.startsWith('172.28.') ||
      hostname.startsWith('172.29.') ||
      hostname.startsWith('172.30.') ||
      hostname.startsWith('172.31.') ||
      hostname.startsWith('169.254.') || // Link-local
      hostname.startsWith('fe80:') || // IPv6 link-local
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return false;
    }

    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validate and sanitize URL for server side requests
 */
export function validateRequestUrl(url, allowedDomains = []) {
  if (!url || typeof url !== 'string') {
    return { valid: false, reason: 'invalid_url' };
  }

  if (!isUrlSafe(url)) {
    return { valid: false, reason: 'url_not_safe' };
  }

  // If allowed domains specified check against whitelist
  if (allowedDomains.length > 0) {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      
      const isAllowed = allowedDomains.some(domain => {
        const domainLower = domain.toLowerCase();
        return hostname === domainLower || hostname.endsWith('.' + domainLower);
      });

      if (!isAllowed) {
        return { valid: false, reason: 'domain_not_allowed' };
      }
    } catch {
      return { valid: false, reason: 'invalid_url_format' };
    }
  }

  return { valid: true };
}


export function isPrivateIp(ip) {
  if (!ip) return true;

  // IPv4 private ranges
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^169\.254\./,
    /^0\.0\.0\.0$/,
  ];

  if (privateRanges.some(range => range.test(ip))) {
    return true;
  }

  // IPv6 private ranges
  if (ip.startsWith('fe80:') || ip.startsWith('::1') || ip === '::') {
    return true;
  }

  return false;
}

