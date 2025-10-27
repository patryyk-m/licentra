import { NextResponse } from 'next/server';

// Simple in memory rate limiter
const rateLimitMap = new Map();

// Check rate limit and return if exceeded
export function checkRateLimit(req, limit = 10, windowMinutes = 1) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                   req.headers.get('x-real-ip') || 
                   'unknown';
  
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  
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

