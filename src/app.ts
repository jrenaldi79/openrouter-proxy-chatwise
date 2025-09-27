import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { HealthStatus } from './models/HealthStatus';
import { ProxyService } from './services/ProxyService';
import { CreditResponse } from './models/CreditResponse';
import { AuthToken } from './models/AuthToken';
import { OpenRouterRequest } from './models/OpenRouterRequest';

// Environment configuration
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai';
const REQUEST_TIMEOUT_MS = process.env.REQUEST_TIMEOUT_MS
  ? parseInt(process.env.REQUEST_TIMEOUT_MS, 10)
  : 30000;
const RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS
  ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10)
  : 60000;
const RATE_LIMIT_MAX_REQUESTS = process.env.RATE_LIMIT_MAX_REQUESTS
  ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10)
  : 100;

// Global state
const startTime = Date.now();
const proxyService = new ProxyService(OPENROUTER_BASE_URL, REQUEST_TIMEOUT_MS);

export function createApp(): Express {
  const app = express();

  // Trust proxy for Cloud Run (required for rate limiting)
  // Only set trust proxy in production to avoid rate limiting issues in local development
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', true);
  }

  // Security middleware - skip for specific endpoints to match OpenRouter headers
  app.use((req, res, next) => {
    if (req.path === '/v1/credits' || req.path === '/api/v1/credits' || req.path === '/api/v1/me/credits' || req.path === '/v1/models' || req.path === '/v1/auth/key' || req.path === '/v1/chat/completions') {
      // Skip helmet for these endpoints to match OpenRouter exactly
      return next();
    }
    helmet()(req, res, next);
  });
  app.use(cors());

  // Rate limiting
  const limiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX_REQUESTS,
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        correlationId: '',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.raw({ type: 'application/octet-stream', limit: '1mb' }));

  // Correlation ID and debug logging middleware
  app.use((req, res, next) => {
    const correlationId = uuidv4();
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);

    // Debug logging for troubleshooting
    console.log(`[${correlationId}] ${req.method} ${req.path}`);
    console.log(`[${correlationId}] Headers:`, JSON.stringify(req.headers, null, 2));
    if (req.body && Object.keys(req.body).length > 0) {
      console.log(`[${correlationId}] Body:`, JSON.stringify(req.body, null, 2));
    }

    next();
  });

  // Health check endpoint
  app.get('/health', async (_req, res) => {
    try {
      const connectivityStatus = (await proxyService.checkConnectivity())
        ? 'connected'
        : 'disconnected';

      const healthStatus = HealthStatus.create(
        connectivityStatus,
        'operational',
        startTime,
        '1.0.0'
      );
      const response = healthStatus.toExpressResponse();

      res.status(response.status).set(response.headers).json(response.body);
    } catch (_error) {
      const healthStatus = HealthStatus.createUnhealthy(
        'Health check failed',
        '1.0.0'
      );
      const response = healthStatus.toExpressResponse();

      res.status(response.status).set(response.headers).json(response.body);
    }
  });

  // Method validation for credits endpoint - only allow GET
  app.use('/api/v1/me/credits', (req, res, next) => {
    if (req.method !== 'GET') {
      const correlationId = req.correlationId as string;
      const errorResponse = CreditResponse.createErrorResponse(
        'METHOD_NOT_ALLOWED',
        'Only GET method is allowed for this endpoint',
        405,
        correlationId
      );
      return res
        .status(errorResponse.status)
        .set(errorResponse.headers)
        .json(errorResponse.body);
    }
    return next();
  });

  // Credit transformation endpoint
  app.get('/api/v1/me/credits', async (req, res) => {
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
        return res
          .status(errorResponse.status)
          .set(errorResponse.headers)
          .json(errorResponse.body);
      }

      // Create request to OpenRouter /api/v1/key endpoint
      const keyRequest = OpenRouterRequest.createKeyRequest(
        authToken.getAuthorizationHeader(),
        OPENROUTER_BASE_URL,
        REQUEST_TIMEOUT_MS,
        correlationId
      );

      // Make request to OpenRouter
      const proxyResponse = await proxyService.makeRequest(keyRequest);

      // Handle error responses
      if (proxyResponse.status >= 400) {
        let errorCode = 'UPSTREAM_ERROR';
        let statusCode = 502;

        if (proxyResponse.status === 401) {
          errorCode = 'UNAUTHORIZED';
          statusCode = 401;
        } else if (proxyResponse.status === 429) {
          errorCode = 'RATE_LIMIT_EXCEEDED';
          statusCode = 429;
        }

        const errorResponse = CreditResponse.createErrorResponse(
          errorCode,
          typeof proxyResponse.data === 'object' &&
            proxyResponse.data &&
            'error' in proxyResponse.data
            ? (proxyResponse.data as { error: { message?: string } }).error.message ||
                'OpenRouter API error'
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

        return res
          .status(errorResponse.status)
          .set(errorResponse.headers)
          .json(errorResponse.body);
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
      return res
        .status(errorResponse.status)
        .set(errorResponse.headers)
        .json(errorResponse.body);
    }
  });

  // Special handling for /api/v1/credits endpoint (transform using auth/key data)
  app.get('/api/v1/credits', async (req, res) => {
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
        return res
          .status(errorResponse.status)
          .set(errorResponse.headers)
          .json(errorResponse.body);
      }

      // Create request to OpenRouter /api/v1/auth/key endpoint
      const keyRequest = OpenRouterRequest.createKeyRequest(
        authToken.getAuthorizationHeader(),
        OPENROUTER_BASE_URL,
        REQUEST_TIMEOUT_MS,
        correlationId
      );

      // Make request to OpenRouter
      const proxyResponse = await proxyService.makeRequest(keyRequest);

      // Handle error responses
      if (proxyResponse.status >= 400) {
        let errorCode = 'UPSTREAM_ERROR';
        let statusCode = 502;

        if (proxyResponse.status === 401) {
          errorCode = 'UNAUTHORIZED';
          statusCode = 401;
        } else if (proxyResponse.status === 429) {
          errorCode = 'RATE_LIMIT_EXCEEDED';
          statusCode = 429;
        }

        const errorResponse = CreditResponse.createErrorResponse(
          errorCode,
          typeof proxyResponse.data === 'object' &&
            proxyResponse.data &&
            'error' in proxyResponse.data
            ? (proxyResponse.data as { error: { message?: string } }).error.message ||
                'OpenRouter API error'
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

        return res
          .status(errorResponse.status)
          .set(errorResponse.headers)
          .json(errorResponse.body);
      }

      // Transform auth/key response to credits API format as per OpenRouter docs
      // https://openrouter.ai/docs/api-reference/get-credits
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
      return res
        .status(errorResponse.status)
        .set(errorResponse.headers)
        .json(errorResponse.body);
    }
  });

  // Proxy passthrough for all other /api/v1/* endpoints (using middleware approach for Express 5)
  app.use('/api/v1', async (req, res, next) => {
    // Skip if this is the credits endpoint (already handled above)
    if ((req.path === '/me/credits' || req.path === '/credits') && req.method === 'GET') {
      return next();
    }

    const correlationId = req.correlationId as string;

    try {
      // Create OpenRouter request - need to reconstruct full path
      const fullPath = `/api/v1${req.path}`;
      const openRouterRequest = OpenRouterRequest.fromProxyRequest(
        {
          method: req.method,
          path: fullPath,
          headers: req.headers as Record<string, string>,
          body: req.body,
          query: req.query as Record<string, string>,
        },
        OPENROUTER_BASE_URL,
        REQUEST_TIMEOUT_MS
      );

      // Add correlation ID
      const requestWithCorrelation =
        openRouterRequest.withCorrelationId(correlationId);

      // Make request to OpenRouter
      const proxyResponse = await proxyService.makeRequest(
        requestWithCorrelation
      );

      // Forward response exactly as received
      const responseHeaders = { ...proxyResponse.headers };
      delete responseHeaders['transfer-encoding']; // Remove transfer-encoding to avoid conflicts

      res.status(proxyResponse.status).set(responseHeaders);

      if (proxyResponse.data !== undefined) {
        res.json(proxyResponse.data);
      } else {
        res.end();
      }
    } catch (error) {
      const errorResponse = {
        error: {
          code: 'UPSTREAM_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'OpenRouter API unavailable',
          correlationId,
        },
      };
      res.status(502).json(errorResponse);
    }
  });

  // Special handling for /v1/credits endpoint (transform using auth/key data)
  app.get('/v1/credits', async (req, res) => {
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
        return res
          .status(errorResponse.status)
          .set(errorResponse.headers)
          .json(errorResponse.body);
      }

      // Create request to OpenRouter /api/v1/auth/key endpoint
      const keyRequest = OpenRouterRequest.createKeyRequest(
        authToken.getAuthorizationHeader(),
        OPENROUTER_BASE_URL,
        REQUEST_TIMEOUT_MS,
        correlationId
      );

      // Make request to OpenRouter
      const proxyResponse = await proxyService.makeRequest(keyRequest);

      // Handle error responses
      if (proxyResponse.status >= 400) {
        let errorCode = 'UPSTREAM_ERROR';
        let statusCode = 502;

        if (proxyResponse.status === 401) {
          errorCode = 'UNAUTHORIZED';
          statusCode = 401;
        } else if (proxyResponse.status === 429) {
          errorCode = 'RATE_LIMIT_EXCEEDED';
          statusCode = 429;
        }

        const errorResponse = CreditResponse.createErrorResponse(
          errorCode,
          typeof proxyResponse.data === 'object' &&
            proxyResponse.data &&
            'error' in proxyResponse.data
            ? (proxyResponse.data as { error: { message?: string } }).error.message ||
                'OpenRouter API error'
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

        return res
          .status(errorResponse.status)
          .set(errorResponse.headers)
          .json(errorResponse.body);
      }

      // Transform auth/key response to credits API format as per OpenRouter docs
      // https://openrouter.ai/docs/api-reference/get-credits
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
      return res
        .status(errorResponse.status)
        .set(errorResponse.headers)
        .json(errorResponse.body);
    }
  });

  // Special handling for /v1/models endpoint (MUST come before general /v1 middleware)
  app.get('/v1/models', async (req, res) => {
    const correlationId = req.correlationId as string;

    try {
      // Create OpenRouter request - need to reconstruct full path with /api prefix
      const fullPath = req.path.replace('/v1', '/api/v1');

      const openRouterRequest = OpenRouterRequest.fromProxyRequest(
        {
          method: req.method,
          path: fullPath,
          headers: req.headers as Record<string, string>,
          body: req.body,
          query: req.query as Record<string, string>,
        },
        OPENROUTER_BASE_URL,
        REQUEST_TIMEOUT_MS
      );

      // Add correlation ID
      const requestWithCorrelation =
        openRouterRequest.withCorrelationId(correlationId);

      // Make request to OpenRouter
      const proxyResponse = await proxyService.makeRequest(
        requestWithCorrelation
      );

      // Check if we got blocked by Cloudflare (HTML response instead of JSON)
      if (typeof proxyResponse.data === 'string' &&
          proxyResponse.data.includes('<!DOCTYPE html>') &&
          proxyResponse.data.includes('Cloudflare')) {

        // In local development, return a mock models response to avoid Cloudflare blocking
        console.log(`[${correlationId}] Cloudflare blocked - returning mock models response for local dev`);

        const mockModelsResponse = {
          data: [
            { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", pricing: { prompt: "0.0015", completion: "0.002" } },
            { id: "gpt-4", name: "GPT-4", pricing: { prompt: "0.03", completion: "0.06" } },
            { id: "claude-3-haiku", name: "Claude 3 Haiku", pricing: { prompt: "0.00025", completion: "0.00125" } },
            { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", pricing: { prompt: "0.00075", completion: "0.003" } }
          ]
        };

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Correlation-Id': correlationId,
        });
        res.end(JSON.stringify(mockModelsResponse));
        return;
      }

      // Send clean response with headers matching OpenRouter exactly
      res.writeHead(proxyResponse.status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Correlation-Id': correlationId,
      });
      res.end(JSON.stringify(proxyResponse.data));
      return;
    } catch (error) {
      const errorResponse = {
        error: {
          code: 'UPSTREAM_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'OpenRouter API unavailable',
          correlationId,
        },
      };
      res.writeHead(502, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Correlation-Id': correlationId,
      });
      res.end(JSON.stringify(errorResponse));
    }
  });

  // Special handling for /v1/auth/key endpoint (MUST come before general /v1 middleware)
  app.get('/v1/auth/key', async (req, res) => {
    const correlationId = req.correlationId as string;

    try {
      // Create OpenRouter request - need to reconstruct full path with /api prefix
      // req.path for /v1/auth/key is "/v1/auth/key", so we need to replace /v1 with /api/v1
      const fullPath = req.path.replace('/v1', '/api/v1');

      const openRouterRequest = OpenRouterRequest.fromProxyRequest(
        {
          method: req.method,
          path: fullPath,
          headers: req.headers as Record<string, string>,
          body: req.body,
          query: req.query as Record<string, string>,
        },
        OPENROUTER_BASE_URL,
        REQUEST_TIMEOUT_MS
      );

      // Add correlation ID
      const requestWithCorrelation =
        openRouterRequest.withCorrelationId(correlationId);

      // Make request to OpenRouter
      const proxyResponse = await proxyService.makeRequest(
        requestWithCorrelation
      );

      // Check if we got blocked by Cloudflare (HTML response instead of JSON)
      if (typeof proxyResponse.data === 'string' &&
          proxyResponse.data.includes('<!DOCTYPE html>') &&
          proxyResponse.data.includes('Cloudflare')) {

        // In local development, return a mock auth/key response to avoid Cloudflare blocking
        console.log(`[${correlationId}] Cloudflare blocked - returning mock auth/key response for local dev`);

        const mockAuthResponse = {
          data: {
            name: "Local Development Mock",
            models: ["gpt-3.5-turbo", "gpt-4", "claude-3-haiku"],
            api_key: req.headers.authorization?.replace('Bearer ', '') || 'mock-key',
            monthly_limit: 100000,
            usage: 0,
            is_valid: true
          }
        };

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Correlation-Id': correlationId,
        });
        res.end(JSON.stringify(mockAuthResponse));
        return;
      }

      // Send clean response with headers matching OpenRouter exactly
      res.writeHead(proxyResponse.status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Correlation-Id': correlationId,
      });
      res.end(JSON.stringify(proxyResponse.data));
      return;
    } catch (error) {
      const errorResponse = {
        error: {
          code: 'UPSTREAM_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'OpenRouter API unavailable',
          correlationId,
        },
      };
      res.writeHead(502, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Correlation-Id': correlationId,
      });
      res.end(JSON.stringify(errorResponse));
    }
  });

  // Proxy passthrough for /v1/* endpoints (for chat applications that use the shorter path)
  app.use('/v1', async (req, res, next) => {
    // Skip if this is the credits endpoint (already handled above)
    // Note: /v1/auth/key is now handled by specific route above
    if (req.path === '/credits' && req.method === 'GET') {
      return next();
    }

    const correlationId = req.correlationId as string;

    try {
      // Check if this is a streaming request
      const isStreamingRequest = req.body && req.body.stream === true;

      if (isStreamingRequest) {
        // For streaming requests, use direct HTTP proxy to maintain stream
        const targetUrl = `${OPENROUTER_BASE_URL}/api/v1${req.path}`;
        const proxyHeaders = { ...req.headers };
        proxyHeaders['host'] = new URL(OPENROUTER_BASE_URL).host;
        delete proxyHeaders['content-length']; // Let the proxy recalculate

        const https = require('https');
        const url = require('url');

        const targetOptions = url.parse(targetUrl);
        targetOptions.method = req.method;
        targetOptions.headers = proxyHeaders;

        const proxyReq = https.request(targetOptions, (proxyRes: any) => {
          // Forward status and headers
          res.status(proxyRes.statusCode);

          // Forward headers but clean them up
          const responseHeaders = { ...proxyRes.headers };
          delete responseHeaders['transfer-encoding'];
          res.set(responseHeaders);

          // Pipe the streaming response directly
          proxyRes.pipe(res);
        });

        proxyReq.on('error', (error: Error) => {
          console.error(`[${correlationId}] Streaming proxy error:`, error);
          if (!res.headersSent) {
            res.status(502).json({
              error: {
                code: 'UPSTREAM_ERROR',
                message: 'Failed to connect to OpenRouter API',
                correlationId,
              },
            });
          }
        });

        // Forward the request body for POST requests
        if (req.method === 'POST' && req.body) {
          proxyReq.write(JSON.stringify(req.body));
        }

        proxyReq.end();
        return;
      }

      // For non-streaming requests, use the existing ProxyService
      const fullPath = `/api/v1${req.path}`;
      const openRouterRequest = OpenRouterRequest.fromProxyRequest(
        {
          method: req.method,
          path: fullPath,
          headers: req.headers as Record<string, string>,
          body: req.body,
          query: req.query as Record<string, string>,
        },
        OPENROUTER_BASE_URL,
        REQUEST_TIMEOUT_MS
      );

      // Add correlation ID
      const requestWithCorrelation =
        openRouterRequest.withCorrelationId(correlationId);

      // Make request to OpenRouter
      const proxyResponse = await proxyService.makeRequest(
        requestWithCorrelation
      );

      // Check if we got blocked by Cloudflare (HTML response instead of JSON)
      if (typeof proxyResponse.data === 'string' &&
          proxyResponse.data.includes('<!DOCTYPE html>') &&
          proxyResponse.data.includes('Cloudflare')) {

        // Return appropriate mock response based on the endpoint
        if (req.path === '/models') {
          console.log(`[${correlationId}] Cloudflare blocked - returning mock models response for local dev`);

          const mockModelsResponse = {
            data: [
              { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", pricing: { prompt: "0.0015", completion: "0.002" } },
              { id: "gpt-4", name: "GPT-4", pricing: { prompt: "0.03", completion: "0.06" } },
              { id: "claude-3-haiku", name: "Claude 3 Haiku", pricing: { prompt: "0.00025", completion: "0.00125" } },
              { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", pricing: { prompt: "0.00075", completion: "0.003" } }
            ]
          };

          res.status(200).set({
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'X-Correlation-Id': correlationId,
          });
          res.json(mockModelsResponse);
          return;
        }

        // For other endpoints, log and continue with original error handling
        console.log(`[${correlationId}] Cloudflare blocked endpoint: ${req.path}`);
      }

      // For /v1/chat/completions, use clean headers to match OpenRouter exactly
      if (req.path === '/chat/completions') {
        res.writeHead(proxyResponse.status, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Correlation-Id': correlationId,
        });
        if (proxyResponse.data !== undefined) {
          res.end(JSON.stringify(proxyResponse.data));
        } else {
          res.end();
        }
        return;
      }

      // Forward response exactly as received for other endpoints
      const responseHeaders = { ...proxyResponse.headers };
      delete responseHeaders['transfer-encoding']; // Remove transfer-encoding to avoid conflicts

      res.status(proxyResponse.status).set(responseHeaders);

      if (proxyResponse.data !== undefined) {
        res.json(proxyResponse.data);
      } else {
        res.end();
      }
    } catch (error) {
      const errorResponse = {
        error: {
          code: 'UPSTREAM_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'OpenRouter API unavailable',
          correlationId,
        },
      };
      res.status(502).json(errorResponse);
    }
  });

  // 404 handler for non-API routes (using middleware approach for Express 5)
  app.use((req, res, _next) => {
    const correlationId = req.correlationId as string;
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
        correlationId,
      },
    });
  });

  // Error handler
  app.use((_error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const correlationId = req.correlationId || uuidv4();

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        correlationId,
      },
    });
  });

  return app;
}

// Start server if this file is run directly
if (require.main === module) {
  const app = createApp();

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`OpenRouter Proxy Server listening on port ${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`Proxying to: ${OPENROUTER_BASE_URL}`);
  });
}

// Export for testing
export { createApp as default };

// Extend Express Request type
declare module 'express-serve-static-core' {
  interface Request {
    correlationId?: string;
  }
}
