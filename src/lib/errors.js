import { NextResponse } from 'next/server';

/**
 * Global error handler for consistent API error responses
 */
export function handleApiError(error, context = '') {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Log full error server-side (never expose to client)
  console.error(`[${context}] Error:`, {
    message: error?.message,
    stack: isProduction ? undefined : error?.stack,
    name: error?.name,
    timestamp: new Date().toISOString(),
  });

  // Determine error type and status code
  let statusCode = 500;
  let message = 'internal server error';

  // Handle known error types
  if (error?.name === 'ValidationError' || error?.name === 'ZodError') {
    statusCode = 400;
    message = 'validation error';
  } else if (error?.name === 'UnauthorizedError' || error?.message?.includes('Unauthorized')) {
    statusCode = 401;
    message = 'unauthorized';
  } else if (error?.name === 'ForbiddenError' || error?.message?.includes('Forbidden')) {
    statusCode = 403;
    message = 'forbidden';
  } else if (error?.name === 'NotFoundError') {
    statusCode = 404;
    message = 'resource not found';
  } else if (error?.code === 11000) {
    // MongoDB duplicate key error
    statusCode = 409;
    message = 'duplicate entry';
  } else if (error?.name === 'MongoServerError') {
    // Generic MongoDB error
    statusCode = 500;
    message = 'database error';
  }

  // Return sanitized error response
  return NextResponse.json(
    {
      success: false,
      message,
      ...(isProduction ? {} : { _dev: { context, error: error?.message } }),
    },
    { status: statusCode }
  );
}

/**
 * Wrapper for API route handlers with automatic error handling
 */
export function withErrorHandler(handler, context = '') {
  return async (req, params) => {
    try {
      return await handler(req, params);
    } catch (error) {
      return handleApiError(error, context || handler.name || 'API');
    }
  };
}

/**
 * Fail-safe default response
 */
export function failSafeResponse(message = 'service unavailable', status = 503) {
  return NextResponse.json(
    { success: false, message },
    { status }
  );
}


