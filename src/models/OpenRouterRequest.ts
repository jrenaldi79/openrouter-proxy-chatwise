export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface OpenRouterRequestData {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  timeout: number;
  retryConfig?: RetryConfig | undefined;
}

export class OpenRouterRequest {
  public readonly url: string;
  public readonly method: string;
  public readonly headers: Record<string, string>;
  public readonly body?: unknown;
  public readonly timeout: number;
  public readonly retryConfig: RetryConfig;

  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 10000, // 10 seconds
    backoffMultiplier: 2,
  };

  constructor(data: OpenRouterRequestData) {
    this.url = data.url;
    this.method = data.method.toUpperCase();
    this.headers = { ...data.headers };
    this.body = data.body;
    this.timeout = data.timeout;
    this.retryConfig =
      data.retryConfig ?? OpenRouterRequest.DEFAULT_RETRY_CONFIG;

    this.validate();
  }

  private validate(): void {
    // Validate URL
    if (!this.isValidOpenRouterUrl(this.url)) {
      throw new Error(`Invalid OpenRouter URL: ${this.url}`);
    }

    // Validate HTTP method
    const validMethods = [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'PATCH',
      'HEAD',
      'OPTIONS',
    ];
    if (!validMethods.includes(this.method)) {
      throw new Error(`Invalid HTTP method: ${this.method}`);
    }

    // Validate timeout
    if (this.timeout <= 0 || this.timeout > 300000) {
      // Max 5 minutes
      throw new Error(`Invalid timeout: ${this.timeout}ms`);
    }

    // Validate Authorization header is present for authenticated endpoints
    if (this.requiresAuthentication() && !this.getAuthorizationHeader()) {
      throw new Error(
        'Authorization header required for authenticated endpoints'
      );
    }

    // Validate retry configuration
    this.validateRetryConfig();
  }

  private isValidOpenRouterUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return (
        parsedUrl.hostname === 'openrouter.ai' &&
        parsedUrl.protocol === 'https:'
      );
    } catch {
      return false;
    }
  }

  private requiresAuthentication(): boolean {
    // Most OpenRouter API endpoints require authentication
    // Only health/status endpoints might be public
    const publicEndpoints = ['/health', '/status', '/ping'];
    const path = new URL(this.url).pathname;
    return !publicEndpoints.includes(path);
  }

  private validateRetryConfig(): void {
    const { maxRetries, baseDelay, maxDelay, backoffMultiplier } =
      this.retryConfig;

    if (maxRetries < 0 || maxRetries > 10) {
      throw new Error(`Invalid maxRetries: ${maxRetries}`);
    }

    if (baseDelay < 0 || baseDelay > 60000) {
      // Max 1 minute base delay
      throw new Error(`Invalid baseDelay: ${baseDelay}ms`);
    }

    if (maxDelay < baseDelay || maxDelay > 300000) {
      // Max 5 minutes max delay
      throw new Error(`Invalid maxDelay: ${maxDelay}ms`);
    }

    if (backoffMultiplier < 1 || backoffMultiplier > 10) {
      throw new Error(`Invalid backoffMultiplier: ${backoffMultiplier}`);
    }
  }

  public getAuthorizationHeader(): string | undefined {
    return this.headers['authorization'] || this.headers['Authorization'];
  }

  public getApiKey(): string | undefined {
    const authHeader = this.getAuthorizationHeader();
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return undefined;
    }
    return authHeader.substring(7);
  }

  public getContentType(): string | undefined {
    return this.headers['content-type'] || this.headers['Content-Type'];
  }

  public getCorrelationId(): string | undefined {
    return this.headers['x-correlation-id'] || this.headers['X-Correlation-Id'];
  }

  public calculateRetryDelay(attemptNumber: number): number {
    if (attemptNumber >= this.retryConfig.maxRetries) {
      return 0; // No more retries
    }

    const delay =
      this.retryConfig.baseDelay *
      Math.pow(this.retryConfig.backoffMultiplier, attemptNumber);
    return Math.min(delay, this.retryConfig.maxDelay);
  }

  public shouldRetry(attemptNumber: number, error: Error): boolean {
    if (attemptNumber >= this.retryConfig.maxRetries) {
      return false;
    }

    // Retry on network errors, timeouts, and 5xx server errors
    const retryableErrors = [
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'TIMEOUT',
    ];

    const errorMessage = error.message.toUpperCase();
    return retryableErrors.some(retryableError =>
      errorMessage.includes(retryableError)
    );
  }

  public shouldRetryHttpStatus(statusCode: number): boolean {
    // Retry on server errors (5xx) and specific client errors
    const retryableStatusCodes = [500, 502, 503, 504, 429]; // Include 429 for rate limiting
    return retryableStatusCodes.includes(statusCode);
  }

  public withUpdatedHeaders(
    newHeaders: Record<string, string>
  ): OpenRouterRequest {
    return new OpenRouterRequest({
      url: this.url,
      method: this.method,
      headers: { ...this.headers, ...newHeaders },
      body: this.body,
      timeout: this.timeout,
      retryConfig: this.retryConfig,
    });
  }

  public withCorrelationId(correlationId: string): OpenRouterRequest {
    return this.withUpdatedHeaders({ 'X-Correlation-Id': correlationId });
  }

  public toJSON(): OpenRouterRequestData {
    return {
      url: this.url,
      method: this.method,
      headers: this.headers,
      body: this.body,
      timeout: this.timeout,
      retryConfig: this.retryConfig,
    };
  }

  public static fromProxyRequest(
    proxyRequest: {
      method: string;
      path: string;
      headers: Record<string, string>;
      body?: unknown;
      query: Record<string, string>;
    },
    baseUrl: string,
    timeout: number,
    retryConfig?: RetryConfig
  ): OpenRouterRequest {
    // Construct full URL
    const url = new URL(proxyRequest.path, baseUrl);

    // Add query parameters
    Object.entries(proxyRequest.query).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    return new OpenRouterRequest({
      url: url.toString(),
      method: proxyRequest.method,
      headers: proxyRequest.headers,
      body: proxyRequest.body,
      timeout,
      retryConfig,
    });
  }

  public static createKeyRequest(
    authorizationHeader: string,
    baseUrl: string,
    timeout: number,
    correlationId: string,
    retryConfig?: RetryConfig
  ): OpenRouterRequest {
    const url = new URL('/api/v1/key', baseUrl);

    return new OpenRouterRequest({
      url: url.toString(),
      method: 'GET',
      headers: {
        Authorization: authorizationHeader,
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
      },
      timeout,
      retryConfig,
    });
  }
}
