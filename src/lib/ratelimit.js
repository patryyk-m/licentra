import { NextResponse } from 'next/server';
import { logRateLimitEvent, getClientIp } from './security-logger';

// Simple in memory rate limiter
const rateLimitMap = new Map();

// Check rate limit and return if exceeded
export function checkRateLimit(req, config) {
  if (!config || typeof config !== 'object') {
    console.error('[ratelimit] invalid config provided, using default');
    config = { limit: 60, windowMinutes: 1 };
  }
  
  const limit = config.limit ?? 60;
  const window = config.windowMinutes ?? 1;
  const clientIp = getClientIp(req);
  
  const now = Date.now();
  const windowMs = window * 60 * 1000;
  
  const record = rateLimitMap.get(clientIp);
  
  if (!record) {
    rateLimitMap.set(clientIp, {
      count: 1,
      resetAt: now + windowMs,
    });
    return null;
  }
  
  if (now > record.resetAt) {
    rateLimitMap.set(clientIp, {
      count: 1,
      resetAt: now + windowMs,
    });
    return null;
  }
  
  if (record.count >= limit) {
    // Log rate limit event
    const url = new URL(req.url);
    logRateLimitEvent(clientIp, url.pathname, req).catch(() => {});
    
    return NextResponse.json(
      {
        success: false,
        message: 'Too many requests. Please try again later.',
      },
      { status: 429 }
    );
  }
  
  record.count++;
  rateLimitMap.set(clientIp, record);
  return null;
}

// Clean up old rate limit records
export function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

// Clean up every 5 minutes
setInterval(cleanupRateLimit, 5 * 60 * 1000);

