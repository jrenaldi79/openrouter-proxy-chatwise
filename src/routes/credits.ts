/**
 * Credit transformation routes
 */

import { Request, Response, NextFunction } from 'express';
import { CreditResponse } from '../models/CreditResponse';
import { AuthToken } from '../models/AuthToken';
import { OpenRouterRequest } from '../models/OpenRouterRequest';
import { proxyService } from '../config/services';
import { envConfig } from '../config/environment';

/**
 * Method validation for credits endpoint - only allow GET
 */
export function creditsMethodValidation(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET') {
    const correlationId = req.correlationId as string;
    const errorResponse = CreditResponse.createErrorResponse(
      'METHOD_NOT_ALLOWED',
      'Only GET method is allowed for this endpoint',
      405,
      correlationId
    );
    res
      .status(errorResponse.status)
      .set(errorResponse.headers)
      .json(errorResponse.body);
    return;
  }
  next();
}

/**
 * Common credit response handler
 */
async function handleCreditRequest(req: Request, res: Response): Promise<void> {
  const correlationId = req.correlationId as string;

  try {
    // Validate authorization
    const authToken = AuthToken.fromRequest(req);
    if (!authToken || !authToken.isValid) {
      const errorResponse = CreditResponse.createErrorResponse(
        'UNAUTHORIZED',
        authToken
          ? 'Invalid API key format'
          : 'Authorization header required',
        401,
        correlationId
      );
      res
        .status(errorResponse.status)
        .set(errorResponse.headers)
        .json(errorResponse.body);
      return;
    }

    // Create request to OpenRouter /api/v1/key endpoint
    const keyRequest = OpenRouterRequest.createKeyRequest(
      authToken.getAuthorizationHeader(),
      envConfig.OPENROUTER_BASE_URL,
      envConfig.REQUEST_TIMEOUT_MS,
      correlationId
    );

    // Make request to OpenRouter
    const proxyResponse = await proxyService.makeRequest(keyRequest);

    // Handle error responses
    if (proxyResponse.status >= 400) {
      let errorCode = 'UPSTREAM_ERROR';
      let statusCode = proxyResponse.status; // Preserve original status code

      if (proxyResponse.status === 400) {
        errorCode = 'BAD_REQUEST';
      } else if (proxyResponse.status === 401) {
        errorCode = 'UNAUTHORIZED';
      } else if (proxyResponse.status === 402) {
        errorCode = 'INSUFFICIENT_CREDITS';
      } else if (proxyResponse.status === 404) {
        errorCode = 'NOT_FOUND';
      } else if (proxyResponse.status === 408) {
        errorCode = 'REQUEST_TIMEOUT';
      } else if (proxyResponse.status === 429) {
        errorCode = 'RATE_LIMIT_EXCEEDED';
      } else if (proxyResponse.status >= 500) {
        // Map 5xx server errors to 502 for consistency
        statusCode = 502;
      }

      const errorResponse = CreditResponse.createErrorResponse(
        errorCode,
        typeof proxyResponse.data === 'object' &&
          proxyResponse.data &&
          'error' in proxyResponse.data
          ? (proxyResponse.data as { error: { message?: string } }).error
              .message || 'OpenRouter API error'
          : 'OpenRouter API unavailable',
        statusCode,
        correlationId
      );

      if (
        proxyResponse.status === 429 &&
        proxyResponse.headers['retry-after']
      ) {
        errorResponse.headers['Retry-After'] =
          proxyResponse.headers['retry-after'];
      }

      res
        .status(errorResponse.status)
        .set(errorResponse.headers)
        .json(errorResponse.body);
      return;
    }

    // Transform the response - extract data from nested OpenRouter response
    const openRouterResponse = proxyResponse.data as { data?: unknown };
    const keyData = openRouterResponse.data;

    const validatedData = CreditResponse.validateKeyResponseData(keyData);
    const creditResponse = CreditResponse.fromKeyResponse(
      validatedData,
      correlationId,
      proxyResponse.headers
    );
    const response = creditResponse
      .withCacheHeaders('MISS')
      .toExpressResponse();

    // Bypass all middleware and send raw response to match OpenRouter exactly
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Correlation-Id': correlationId,
    });
    res.end(JSON.stringify(response.body));
    return;
  } catch (error) {
    const errorResponse = CreditResponse.createErrorResponse(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Internal server error',
      500,
      correlationId
    );
    res
      .status(errorResponse.status)
      .set(errorResponse.headers)
      .json(errorResponse.body);
  }
}

/**
 * Credit endpoint for /api/v1/me/credits
 */
export const meCreditsHandler = handleCreditRequest;

/**
 * Credit endpoint for /api/v1/credits
 */
export const apiCreditsHandler = handleCreditRequest;

/**
 * Credit endpoint for /v1/credits
 */
export const v1CreditsHandler = handleCreditRequest;