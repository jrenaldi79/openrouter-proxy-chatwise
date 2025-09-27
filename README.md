# OpenRouter API Proxy Server

✅ **CI/CD Pipeline Configured** - Automated testing and deployment ready! (with GCP permissions fixed)

A TypeScript/Node.js proxy server that sits between client applications and the OpenRouter API, intercepting credit requests and transforming them while maintaining complete transparency for all other API calls.

## Overview

This proxy server solves the issue where third-party applications using the OpenRouter API require provisioning keys for the `/api/v1/me/credits` endpoint. The proxy allows standard API keys to work by intercepting credit requests and transforming them via the `/api/v1/key` endpoint.

## Features

- **Transparent Proxy**: All API requests pass through unchanged except for credit endpoints
- **Credit Transformation**: Converts `/api/v1/me/credits` requests to `/api/v1/key` calls with proper response transformation
- **Performance Optimized**: <200ms p95 response time with intelligent caching
- **Security First**: Input validation, rate limiting, secure logging, CORS configuration
- **Production Ready**: Health checks, structured logging, error handling, graceful shutdown
- **Test-Driven**: Comprehensive test suite following TDD principles

## Quick Start

### Prerequisites
- Node.js 18+
- OpenRouter API key (sk-or-v1-...)
- Docker (optional, for containerized deployment)

### Installation
```bash
git clone <repository-url>
cd openrouter-proxy
npm install
cp .env.example .env
```

### Configuration
```bash
# .env
PORT=3000
OPENROUTER_BASE_URL=https://openrouter.ai
REQUEST_TIMEOUT_MS=30000
CACHE_TTL_SECONDS=30
ENABLE_TRANSFORMATION=true
LOG_LEVEL=info
```

### Development
```bash
npm run dev
```

### Testing
```bash
# Health check
curl http://localhost:3000/health

# Credit transformation test
curl -H "Authorization: Bearer sk-or-v1-YOUR_API_KEY" \
     http://localhost:3000/api/v1/me/credits

# Passthrough test
curl -H "Authorization: Bearer sk-or-v1-YOUR_API_KEY" \
     http://localhost:3000/api/v1/models
```

## Architecture

### Core Components
- **ProxyRequest/Response Models**: Request/response data validation and transformation
- **ValidationService**: Input sanitization and API key validation
- **TransformationService**: Response format conversion for credit endpoints
- **CacheService**: Response caching with configurable TTL
- **ProxyService**: OpenRouter API communication with retry logic

### Request Flow
1. Client sends request to proxy
2. Security middleware validates and rate limits
3. For `/api/v1/me/credits`: Transform to `/api/v1/key` call
4. For other endpoints: Direct passthrough to OpenRouter
5. Response transformation (if needed) and caching
6. Return response to client with correlation tracking

## Development

### Project Structure
```
src/
├── models/          # Data models and validation
├── services/        # Business logic services
├── routes/          # API route handlers
├── middleware/      # Express middleware
└── config/          # Configuration management

tests/
├── contract/        # API contract tests
├── integration/     # End-to-end flow tests
└── unit/           # Service unit tests

specs/
├── contracts/       # OpenAPI specifications
├── data-model.md    # Entity definitions
├── plan.md         # Implementation plan
├── tasks.md        # Development tasks
└── quickstart.md   # Testing scenarios
```

### Development Workflow
1. **Test-First Development**: All features start with failing tests
2. **Constitutional Compliance**: Follows project constitution principles
3. **Security by Design**: Input validation, secure logging, rate limiting
4. **Performance Monitoring**: Response time tracking, cache metrics
5. **Error Handling**: Structured error responses with correlation IDs

### Testing Strategy
```bash
# Run all tests
npm test

# Run specific test types
npm run test:unit
npm run test:integration
npm run test:contract

# Performance testing
npm run test:performance

# Test coverage
npm run test:coverage
```

### Testing with Real API Key

To test the proxy with your actual OpenRouter API key:

1. **Set your API key**:
   ```bash
   export OPENROUTER_TEST_API_KEY="sk-or-v1-your-key-here"
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Run the real API test script**:
   ```bash
   npm run test:real-api
   ```

**Manual testing with curl**:
```bash
# Test health check
curl http://localhost:3000/health

# Test credit information
curl -H "Authorization: Bearer $OPENROUTER_TEST_API_KEY" \
     http://localhost:3000/api/v1/me/credits

# Test models list
curl -H "Authorization: Bearer $OPENROUTER_TEST_API_KEY" \
     http://localhost:3000/api/v1/models
```

## Deployment

### Docker
```bash
# Build image
docker build -t openrouter-proxy .

# Run container
docker run -p 3000:3000 \
  -e OPENROUTER_BASE_URL=https://openrouter.ai \
  -e REQUEST_TIMEOUT_MS=30000 \
  openrouter-proxy
```

### Google Cloud Run
```bash
# Deploy to Cloud Run
gcloud run deploy openrouter-proxy \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars OPENROUTER_BASE_URL=https://openrouter.ai
```

## API Documentation

### Health Check
```
GET /health
```
Returns system health status and OpenRouter connectivity.

### Credit Transformation
```
GET /api/v1/me/credits
Authorization: Bearer sk-or-v1-{your-api-key}
```
Returns credit information in expected format by transforming OpenRouter `/api/v1/key` response.

### Proxy Passthrough
```
{METHOD} /api/v1/*
Authorization: Bearer sk-or-v1-{your-api-key}
```
All other endpoints are transparently forwarded to OpenRouter API.

## Monitoring

### Health Checks
- `GET /health` - System and OpenRouter connectivity status
- Container health checks for orchestration platforms
- Structured health metrics for monitoring systems

### Metrics
- Request/response timing with percentile tracking
- Cache hit/miss ratios for optimization insights
- Error rates by endpoint and type
- OpenRouter API latency monitoring
- Memory and CPU usage tracking

### Logging
- Structured JSON logging with configurable levels
- Correlation IDs for request tracing
- Security-conscious logging (no API keys/sensitive data)
- Integration with cloud logging platforms

## Contributing

### Prerequisites
- Follow Test-Driven Development (TDD) principles
- Ensure all tests pass before submission
- Maintain code coverage above 90%
- Follow TypeScript strict mode requirements

### Development Process
1. Read project constitution in `.specify/memory/constitution.md`
2. Create feature specification using `/specify` command
3. Generate implementation plan with `/plan` command
4. Create task list with `/tasks` command
5. Implement following TDD workflow (Red-Green-Refactor)
6. Verify all constitutional requirements met

## License

This project follows the OpenRouter Proxy Constitution v1.0.0 for development practices and code quality standards.

## Support

For issues and questions:
- Check troubleshooting guide in `specs/quickstart.md`
- Review health check endpoint for system status
- Monitor structured logs for detailed error information
- Verify OpenRouter API connectivity and rate limits