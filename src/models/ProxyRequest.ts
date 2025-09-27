import { v4 as uuidv4 } from 'uuid';

export interface ProxyRequestData {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: unknown;
  correlationId?: string;
}

export class ProxyRequest {
  public readonly method: string;
  public readonly path: string;
  public readonly headers: Record<string, string>;
  public readonly query: Record<string, string>;
  public readonly body?: unknown;
  public readonly correlationId: string;

  constructor(data: ProxyRequestData) {
    this.method = data.method.toUpperCase();
    this.path = data.path;
    this.headers = { ...data.headers };
    this.query = { ...data.query };
    this.body = data.body;
    this.correlationId = data.correlationId || uuidv4();

    this.validate();
  }

  private validate(): void {
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

    // Validate path format
    if (!this.path.startsWith('/api/v1/')) {
      throw new Error(`Invalid API path: ${this.path}`);
    }

    // Validate Authorization header format if present
    const authHeader = this.getAuthorizationHeader();
    if (authHeader && !this.isValidApiKeyFormat(authHeader)) {
      throw new Error('Invalid API key format');
    }

    // Ensure no sensitive data in non-auth headers
    this.validateHeaderSecurity();
  }

  public getAuthorizationHeader(): string | undefined {
    return this.headers['authorization'] || this.headers['Authorization'];
  }

  public getApiKey(): string | undefined {
    const authHeader = this.getAuthorizationHeader();
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return undefined;
    }
    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  public isValidApiKeyFormat(authHeader: string): boolean {
    if (!authHeader.startsWith('Bearer ')) {
      return false;
    }

    const apiKey = authHeader.substring(7);
    // OpenRouter API key format: sk-or-v1-{base64-encoded-key}
    return /^sk-or-v1-.+/.test(apiKey);
  }

  public isCreditEndpoint(): boolean {
    return this.method === 'GET' && this.path === '/api/v1/me/credits';
  }

  public isHealthEndpoint(): boolean {
    return this.method === 'GET' && this.path === '/health';
  }

  private validateHeaderSecurity(): void {
    // Check for suspicious patterns in headers
    const suspiciousPatterns = [
      /<script.*?>.*?<\/script>/i,
      /javascript:/i,
      /vbscript:/i,
      /on\w+=/i,
      /\$\(.*\)/,
      /DROP\s+TABLE/i,
      /SELECT.*FROM/i,
      /\.\.\//,
    ];

    Object.entries(this.headers).forEach(([key, value]) => {
      if (key.toLowerCase() === 'authorization') {
        return; // Skip authorization header validation
      }

      suspiciousPatterns.forEach(pattern => {
        if (pattern.test(value)) {
          throw new Error(`Suspicious content detected in header ${key}`);
        }
      });
    });
  }

  public getQueryParameter(key: string): string | undefined {
    return this.query[key];
  }

  public hasQueryParameter(key: string): boolean {
    return key in this.query;
  }

  public getContentType(): string | undefined {
    return this.headers['content-type'] || this.headers['Content-Type'];
  }

  public isJsonContent(): boolean {
    const contentType = this.getContentType();
    return contentType?.includes('application/json') || false;
  }

  public getContentLength(): number | undefined {
    const lengthHeader =
      this.headers['content-length'] || this.headers['Content-Length'];
    return lengthHeader ? parseInt(lengthHeader, 10) : undefined;
  }

  public toJSON(): ProxyRequestData {
    return {
      method: this.method,
      path: this.path,
      headers: this.headers,
      query: this.query,
      body: this.body,
      correlationId: this.correlationId,
    };
  }

  public static fromExpressRequest(req: any): ProxyRequest {
    return new ProxyRequest({
      method: req.method,
      path: req.path,
      headers: req.headers,
      query: req.query,
      body: req.body,
      correlationId: req.correlationId,
    });
  }
}
