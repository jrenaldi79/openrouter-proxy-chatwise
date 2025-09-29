# OpenRouter API Proxy Server

✅ **CI/CD Pipeline Configured** - Automated testing and deployment ready! (full GCP permissions)

A TypeScript/Node.js proxy server that sits between client applications and the OpenRouter API, intercepting credit requests and transforming them while maintaining complete transparency for all other API calls.

## Overview

This proxy server solves the issue where third-party applications using the OpenRouter API require provisioning keys for the `/api/v1/me/credits` endpoint. The proxy allows standard API keys to work by intercepting credit requests and transforming them via the `/api/v1/key` endpoint.

## 🚀 Features & Capabilities

### Core Proxy Functionality
- **🔄 Transparent API Proxy**: All OpenRouter requests pass through unchanged (models, chat, etc.)
- **💳 Smart Credit Transformation**: Converts `/v1/credits` to OpenRouter's `/api/v1/key` endpoint with response normalization
- **⚡ Multiple Endpoint Support**: `/v1/credits`, `/api/v1/credits`, `/api/v1/me/credits` all supported
- **🔀 Path Flexibility**: Supports both `/v1/*` and `/api/v1/*` routing patterns

### Advanced ChatWise Integration
- **💰 Balance Injection**: Automatically injects user balance into ChatWise new chat sessions
- **🎯 Smart Client Detection**: Identifies ChatWise clients via headers and request patterns
- **📡 Streaming Support**: Real-time balance injection for streaming chat completions
- **🔄 Session Management**: Generates unique chat IDs and maintains consistency

### Enterprise Architecture
- **🏗️ Modular Design**: Clean separation of concerns with 5 focused proxy modules (all <200 lines)
- **🛡️ Anti-Monolith Enforcement**: 300-line file limits with automated complexity monitoring
- **⚙️ Configuration Layer**: Centralized environment validation and service initialization
- **🔗 Middleware Chain**: Security, parsing, error handling, and balance injection
- **📁 Organized Structure**: Logical separation of config, middleware, routes, models, services

### Production Monitoring & Observability
- **📊 Google Cloud Monitoring**: Error rates, latency tracking, API health monitoring
- **🚨 Real-time Alerts**: Email notifications for service issues and performance degradation
- **📈 Performance Metrics**: Request timing, cache efficiency, concurrent load handling
- **🔍 Structured Logging**: Winston-based JSON logging with correlation IDs
- **🧪 Comprehensive Testing**: 8 test categories from unit to production validation

### Security & Performance
- **🔒 SSL/TLS Optimized**: Fixed header filtering for reliable OpenRouter connections
- **🌐 CORS Ready**: Configurable cross-origin policies for web application integration
- **⏱️ Request Timeout**: Configurable timeouts with graceful error handling
- **🚦 Rate Limiting**: IP-based rate limiting to prevent abuse
- **🔐 Input Validation**: Strict API key format validation and sanitization

### Developer Experience
- **🧪 Test-Driven Development**: 17 test files across 5 categories (unit, contract, integration, performance, production)
- **📚 Comprehensive Documentation**: Detailed CLAUDE.md with architectural guidelines
- **🔧 Development Tools**: Hot reload, TypeScript strict mode, ESLint configuration
- **🚀 CI/CD Pipeline**: Automated testing, staging deployment, and production rollouts

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

## 🏗️ Architecture

### Modular Design Philosophy
The proxy has been **completely refactored** from a 1,522-line monolithic file into a clean, modular architecture with **anti-monolith enforcement** (300-line file limits).

### Core Components
- **🔧 Configuration Layer**: Environment validation, service initialization
- **🛡️ Security Middleware**: CORS, rate limiting, helmet, trust proxy
- **💰 Balance Injection Service**: ChatWise client detection and balance insertion
- **🔄 Modular Proxy Handlers**: 5 focused route handlers (all <200 lines)
- **📝 Structured Logging**: Winston-based correlation tracking and monitoring
- **🗄️ Data Models**: AuthToken, CreditResponse, HealthStatus, OpenRouterRequest

### Enhanced Request Flow
1. **Client Request** → Proxy server
2. **Security Middleware** → CORS, rate limiting, validation
3. **Correlation Tracking** → Assign unique request ID
4. **Balance Injection** → (ChatWise only) Inject balance into new chat sessions
5. **Route Handling**:
   - `/v1/credits` → Transform to `/api/v1/key` call
   - `/v1/models` → Direct proxy with Cloudflare fallback
   - `/v1/auth/key` → Auth endpoint with mock fallback
   - `/api/v1/*` → Transparent passthrough
   - `/v1/*` → General proxy with streaming support
6. **Response Processing** → Transform, cache, log, return
7. **Client Response** → With correlation ID and proper headers

## 🛠️ Development

### Project Structure (Fully Modular)
```
src/
├── config/                     # 🔧 Configuration & Service Initialization
│   ├── environment.ts          # Environment validation & parsing
│   └── services.ts             # Global service instances
├── middleware/                 # 🛡️ Express Middleware Chain
│   ├── balance-injection.ts    # ChatWise balance injection (245 lines)
│   ├── correlation.ts          # Request correlation ID tracking
│   ├── error-handling.ts       # Global error & 404 handlers
│   ├── parsing.ts              # Body parsing & error handling
│   └── security.ts             # CORS, helmet, rate limiting
├── routes/                     # 🔀 Modular Route Handlers
│   ├── credits.ts              # Credit transformation endpoints
│   ├── health.ts               # Health check endpoint
│   ├── proxy-utils.ts          # Shared proxy utilities (195 lines)
│   ├── proxy-api-v1.ts         # /api/v1/* handlers (92 lines)
│   ├── proxy-v1-models.ts      # /v1/models handler (119 lines)
│   ├── proxy-v1-auth.ts        # /v1/auth/key handler (68 lines)
│   └── proxy-v1-general.ts     # General /v1/* handler (159 lines)
├── models/                     # 📊 Data Models & Validation
├── services/                   # 🧠 Business Logic Services
├── utils/                      # 🔧 Shared Utilities
└── app.ts                      # 🎯 Application Orchestrator (105 lines)

monitoring/                     # 📊 Monitoring & Performance Testing
├── tests/                      # All monitoring test scripts
│   ├── test-monitoring.js      # Monitoring validation
│   ├── test-balance-injection.js # Balance injection testing
│   ├── aggressive-test.js      # Stress testing
│   └── [performance tests]     # Load, latency, API failure tests
├── alert-*.json                # Google Cloud alert configurations
└── *.md                       # Monitoring documentation

tests/                          # 🧪 Comprehensive Test Suite (17 files)
├── unit/                       # Mock-based unit tests (10 files)
├── contract/                   # API contract validation
├── integration/                # Component integration tests
├── performance/                # Real API performance tests
└── production/                 # Real API functional tests

scripts/                        # 🚀 Production Validation
├── test-production.js          # Production environment testing
└── test-real-api.js           # Real API validation
```

### Development Workflow
1. **Test-First Development**: All features start with failing tests
2. **Constitutional Compliance**: Follows project constitution principles
3. **Security by Design**: Input validation, secure logging, rate limiting
4. **Performance Monitoring**: Response time tracking, cache metrics
5. **Error Handling**: Structured error responses with correlation IDs

### Testing Strategy

Our comprehensive test suite is organized into five distinct categories:

#### Test Types
- **Unit Tests** (`tests/unit/`) - Fast, isolated tests using mocks (10 files)
- **Contract Tests** (`tests/contract/`) - API contract validation, no external calls (1 file)
- **Integration Tests** (`tests/integration/`) - Component integration and middleware chains (2 files)
- **Performance Tests** (`tests/performance/`) - Real API performance metrics (1 file)
- **Production Tests** (`tests/production/`) - Real API functional validation (3 files)

#### Test Commands
```bash
# Local development (fast, mock-based)
npm test                    # Unit tests only (default)
npm run test:unit          # Mock-based unit tests
npm run test:contract      # API contract validation
npm run test:integration   # Component integration tests
npm run test:local         # All local tests (unit + contract + integration)

# Real API testing (requires OPENROUTER_TEST_API_KEY)
npm run test:performance   # Performance metrics with real APIs
npm run test:real-api      # Functional validation with real APIs
npm run test:production    # Script-based production validation

# Development utilities
npm run test:coverage      # Generate coverage report
npm run test:watch         # Watch mode for unit tests
npm run test:all          # All tests including integration

# Monitoring tests (organized in monitoring/tests/)
node monitoring/tests/test-monitoring.js        # Monitoring validation
node monitoring/tests/test-balance-injection.js # Balance injection testing
node monitoring/tests/aggressive-test.js        # Stress testing
node monitoring/tests/test-high-latency.js      # Latency testing
```

#### CI/CD Test Strategy
- **Local Development**: `npm run test:local` (unit + contract + integration - no API key required)
- **CI Pipeline**: `npm run test:local` (fast mock-based tests, no real API calls)
- **Staging Environment**:
  - `npm run test:performance` (real API performance validation)
  - `npm run test:real-api` (real API functional validation)
- **Production**: Smoke tests and health checks only

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

3. **Run real API tests**:
   ```bash
   # Functional validation
   npm run test:real-api

   # Performance testing
   npm run test:performance
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

✅ **Enterprise-grade monitoring configured** - Google Cloud monitoring with email alerts ready!

📊 **See [`monitoring/`](./monitoring/) directory for complete setup**

### Health Checks
- `GET /health` - System and OpenRouter connectivity status
- Container health checks for orchestration platforms
- Structured health metrics for monitoring systems

### Google Cloud Monitoring (Configured)
- **Error rate tracking** - Alerts on high 4xx/5xx responses
- **OpenRouter API monitoring** - Detects external service issues
- **Performance monitoring** - Tracks response latency
- **Email notifications** - Immediate alert delivery
- **Test monitoring**: `node monitoring/tests/test-monitoring.js`

### Built-in Metrics
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

## 📚 Documentation

Comprehensive documentation is available in the [`docs/`](docs/) directory:

- **[Documentation Index](docs/README.md)** - Complete documentation overview
- **[Quick Start Testing](docs/quickstart.md)** - Testing scenarios and validation
- **[Testing Guide](docs/testing/TESTING.md)** - Comprehensive testing strategy
- **[CI/CD Pipeline](docs/ci-cd/CI-CD-FLOW.md)** - Automated deployment workflow
- **[Project Specification](docs/openrouter-proxy-spec.md)** - Detailed technical specifications

## License

This project follows the OpenRouter Proxy Constitution v1.0.0 for development practices and code quality standards.

## Support

For issues and questions:
- Check [troubleshooting guide](docs/quickstart.md) for common issues
- Review [testing documentation](docs/testing/TESTING.md) for development workflow
- Monitor health check endpoint for system status
- Check structured logs for detailed error information
- Verify OpenRouter API connectivity and rate limits