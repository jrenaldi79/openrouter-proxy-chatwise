import express, { Express } from 'express';

// Extend Express Request interface for balance injection
declare global {
  namespace Express {
    interface Request {
      balanceInjectionActive?: {
        chatId: string;
        responseStarted: boolean;
      };
    }
  }
}

// Configuration
import { envConfig } from './config/environment';

// Middleware
import { applySecurity } from './middleware/security';
import { applyBodyParsing } from './middleware/parsing';
import { correlationMiddleware } from './middleware/correlation';
import { balanceInjectionMiddleware } from './middleware/balance-injection';
import { notFoundHandler, errorHandler } from './middleware/error-handling';

// Route handlers
import { healthCheck } from './routes/health';
import {
  creditsMethodValidation,
  meCreditsHandler,
  apiCreditsHandler,
  v1CreditsHandler
} from './routes/credits';
import { apiV1ProxyHandler } from './routes/proxy-api-v1';
import { v1ModelsHandler } from './routes/proxy-v1-models';
import { v1AuthKeyHandler } from './routes/proxy-v1-auth';
import { v1ProxyHandler } from './routes/proxy-v1-general';

export function createApp(): Express {
  const app = express();

  // Apply security middleware (helmet, cors, rate limiting, trust proxy)
  applySecurity(app);

  // Apply body parsing middleware
  applyBodyParsing(app);

  // Correlation ID and debug logging middleware
  app.use(correlationMiddleware);

  // Health check endpoint
  app.get('/health', healthCheck);

  // Method validation for credits endpoint - only allow GET
  app.use('/api/v1/me/credits', creditsMethodValidation);

  // Credit transformation endpoints
  app.get('/api/v1/me/credits', meCreditsHandler);
  app.get('/api/v1/credits', apiCreditsHandler);
  app.get('/v1/credits', v1CreditsHandler);

  // Balance injection middleware for new chat sessions
  app.use(['/api/v1/chat/completions', '/v1/chat/completions'], balanceInjectionMiddleware);

  // Proxy passthrough for all other /api/v1/* endpoints
  app.use('/api/v1', apiV1ProxyHandler);

  // Special handling for /v1/models endpoint (MUST come before general /v1 middleware)
  app.get('/v1/models', v1ModelsHandler);

  // Special handling for /v1/auth/key endpoint (MUST come before general /v1 middleware)
  app.get('/v1/auth/key', v1AuthKeyHandler);

  // Proxy passthrough for /v1/* endpoints (for chat applications that use the shorter path)
  app.use('/v1', v1ProxyHandler);

  // 404 handler for non-API routes
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  return app;
}

// Start server if this file is run directly
if (require.main === module) {
  const app = createApp();

  app.listen(envConfig.PORT, () => {
    console.log(`OpenRouter Proxy Server listening on port ${envConfig.PORT}`);
    console.log(`Proxying to: ${envConfig.OPENROUTER_BASE_URL}`);
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