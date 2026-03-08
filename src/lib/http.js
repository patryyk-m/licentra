import { NextResponse } from 'next/server';
import { authenticateUser } from '@/middleware/auth';
import { isAdmin } from '@/lib/authz';
import { requireStepUp } from '@/lib/auth-cookies';

export async function parseJson(req, fallback = {}) {
  return req.json().catch(() => fallback);
}

export function ok(payload = {}, init = {}) {
  return NextResponse.json(payload, init);
}

export function fail(message, status = 400, extra = {}) {
  return NextResponse.json({ success: false, message, ...extra }, { status });
}

export function wrapRoute(handler, onError) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (typeof onError === 'function') return onError(error);
      throw error;
    }
  };
}

export function withAuth(handler, options = {}) {
  const unauthorizedMessage = options.unauthorizedMessage || 'unauthorized';
  const unauthorizedStatus = options.unauthorizedStatus || 401;
  return async (req, ...rest) => {
    const user = await authenticateUser(req);
    if (!user) {
      return fail(unauthorizedMessage, unauthorizedStatus);
    }
    return handler(req, user, ...rest);
  };
}

export function withAdmin(handler, options = {}) {
  const forbiddenMessage = options.forbiddenMessage || 'forbidden';
  const forbiddenStatus = options.forbiddenStatus || 403;
  return withAuth(async (req, user, ...rest) => {
    if (!isAdmin(user)) {
      return fail(forbiddenMessage, forbiddenStatus);
    }
    return handler(req, user, ...rest);
  }, { unauthorizedMessage: forbiddenMessage, unauthorizedStatus: forbiddenStatus });
}

export function withStepUp(handler, options = {}) {
  const stepUpMessage = options.stepUpMessage || 'step-up required';
  const stepUpStatus = options.stepUpStatus || 403;
  return async (req, user, ...rest) => {
    const stepUpOk = await requireStepUp(req, user);
    if (!stepUpOk) {
      return fail(stepUpMessage, stepUpStatus);
    }
    return handler(req, user, ...rest);
  };
}
