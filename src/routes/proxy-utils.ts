/**
 * Shared utilities for proxy route handlers
 */

import { Request, Response } from 'express';
import { AuthToken } from '../models/AuthToken';
import { OpenRouterRequest } from '../models/OpenRouterRequest';
import { envConfig } from '../config/environment';

/**
 * Standard error response structure
 */
export interface ProxyErrorResponse {
  error: {
    code: string;
    message: string;
    correlationId: string;
  };
}

/**
 * Validate authorization for proxy requests
 */
export function validateAuth(req: Request): {
  authToken: AuthToken | null;
  errorResponse: ProxyErrorResponse | null;
} {
  const correlationId = req.correlationId as string;
  const authToken = AuthToken.fromRequest(req);

  if (!authToken || !authToken.isValid) {
    const errorResponse: ProxyErrorResponse = {
      error: {
        code: 'UNAUTHORIZED',
        message: authToken
          ? 'Invalid API key format'
          : 'Authorization header required',
        correlationId,
      },
    };
    return { authToken: null, errorResponse };
  }

  return { authToken, errorResponse: null };
}

/**
 * Create OpenRouter request for proxy
 */
export function createOpenRouterRequest(
  req: Request,
  targetPath: string,
  correlationId: string
): OpenRouterRequest {
  return OpenRouterRequest.fromProxyRequest(
    {
      method: req.method,
      path: targetPath,
      headers: req.headers as Record<string, string>,
      body: req.body,
      query: req.query as Record<string, string>,
    },
    envConfig.OPENROUTER_BASE_URL,
    envConfig.REQUEST_TIMEOUT_MS
  ).withCorrelationId(correlationId);
}

/**
 * Map OpenRouter status codes to error codes
 */
export function mapStatusToErrorCode(status: number): {
  code: string;
  statusCode: number;
} {
  let errorCode = 'UPSTREAM_ERROR';
  let statusCode = status; // Preserve original status code by default

  if (status === 400) {
    errorCode = 'BAD_REQUEST';
  } else if (status === 401) {
    errorCode = 'UNAUTHORIZED';
  } else if (status === 402) {
    errorCode = 'INSUFFICIENT_CREDITS';
  } else if (status === 404) {
    errorCode = 'NOT_FOUND';
  } else if (status === 408) {
    errorCode = 'REQUEST_TIMEOUT';
  } else if (status === 429) {
    errorCode = 'RATE_LIMIT_EXCEEDED';
  } else if (status >= 500) {
    // Map 5xx server errors to 502 for consistency
    statusCode = 502;
  }

  return { code: errorCode, statusCode };
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  status: number,
  data: unknown,
  correlationId: string
): ProxyErrorResponse {
  const { code } = mapStatusToErrorCode(status);

  return {
    error: {
      code,
      message:
        typeof data === 'object' && data && 'error' in data
          ? (data as { error: { message?: string } }).error.message ||
            'OpenRouter API error'
          : 'OpenRouter API error',
      correlationId,
    },
  };
}

/**
 * Send clean response with OpenRouter-compatible headers
 */
export function sendCleanResponse(
  res: Response,
  status: number,
  data: unknown,
  correlationId: string
): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'X-Correlation-Id': correlationId,
  });
  res.end(JSON.stringify(data));
}
