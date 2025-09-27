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

  // Security middleware
  app.use(helmet());
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

  // Correlation ID middleware
  app.use((req, res, next) => {
    const correlationId = uuidv4();
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);
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

      // Transform the response
      const validatedData = CreditResponse.validateKeyResponseData(
        proxyResponse.data
      );
      const creditResponse = CreditResponse.fromKeyResponse(
        validatedData,
        correlationId,
        proxyResponse.headers
      );
      const response = creditResponse
        .withCacheHeaders('MISS')
        .toExpressResponse();

      return res
        .status(response.status)
        .set(response.headers)
        .json(response.body);
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
    if (req.path === '/me/credits' && req.method === 'GET') {
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
