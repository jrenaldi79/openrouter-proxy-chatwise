export interface CreditData {
  total_credits: number;
  total_usage: number;
}

export interface CreditResponseData {
  data: CreditData;
  status?: number;
  headers?: Record<string, string>;
}

export class CreditResponse {
  public readonly data: CreditData;
  public readonly status: number;
  public readonly headers: Record<string, string>;

  constructor(responseData: CreditResponseData) {
    this.data = { ...responseData.data };
    this.status = responseData.status || 200;
    this.headers = responseData.headers || {};

    this.validate();
  }

  private validate(): void {
    // Validate required fields
    if (typeof this.data.total_credits !== 'number') {
      throw new Error('total_credits must be a number');
    }

    if (typeof this.data.total_usage !== 'number') {
      throw new Error('total_usage must be a number');
    }

    // Validate non-negative values
    if (this.data.total_credits < 0) {
      throw new Error('total_credits must be non-negative');
    }

    if (this.data.total_usage < 0) {
      throw new Error('total_usage must be non-negative');
    }

    // Validate status code
    if (this.status < 100 || this.status > 599) {
      throw new Error(`Invalid HTTP status code: ${this.status}`);
    }
  }

  public isUnlimitedAccount(): boolean {
    return this.data.total_credits === 999999;
  }

  public getRemainingCredits(): number {
    if (this.isUnlimitedAccount()) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(0, this.data.total_credits - this.data.total_usage);
  }

  public getUsagePercentage(): number {
    if (this.isUnlimitedAccount()) {
      return 0; // 0% usage for unlimited accounts
    }

    if (this.data.total_credits === 0) {
      return this.data.total_usage > 0 ? 100 : 0;
    }

    return (this.data.total_usage / this.data.total_credits) * 100;
  }

  public isNearLimit(threshold: number = 0.9): boolean {
    if (this.isUnlimitedAccount()) {
      return false;
    }
    return this.getUsagePercentage() >= threshold * 100;
  }

  public hasExceededLimit(): boolean {
    if (this.isUnlimitedAccount()) {
      return false;
    }
    return this.data.total_usage > this.data.total_credits;
  }

  public toJSON(): Record<string, unknown> {
    return {
      data: {
        total_credits: this.data.total_credits,
        total_usage: this.data.total_usage,
      },
    };
  }

  public toExpressResponse(): {
    status: number;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  } {
    return {
      status: this.status,
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: this.toJSON(),
    };
  }

  public static fromKeyResponse(
    keyResponse: { limit: number | null; usage: number; byok_usage?: number },
    correlationId?: string,
    preservedHeaders?: Record<string, string>
  ): CreditResponse {
    // Transform limit field to total_credits
    // null limit means unlimited account -> set to 999999
    const total_credits =
      keyResponse.limit === null ? 999999 : keyResponse.limit;

    // Determine effective usage:
    // For BYOK accounts (byok_usage > 0 and either usage is negligible or byok > usage): use byok_usage
    // Otherwise: use regular usage
    const byokUsage = keyResponse.byok_usage ?? 0;
    const isByokAccount =
      byokUsage > 0 && (keyResponse.usage < 0.01 || byokUsage > keyResponse.usage);
    const total_usage = isByokAccount ? byokUsage : keyResponse.usage;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add correlation ID if provided
    if (correlationId) {
      headers['X-Correlation-Id'] = correlationId;
    }

    // Preserve specific headers from OpenRouter response
    if (preservedHeaders) {
      const headersToPreserve = ['x-ratelimit-remaining', 'x-ratelimit-reset'];
      headersToPreserve.forEach(header => {
        const value =
          preservedHeaders[header] || preservedHeaders[header.toLowerCase()];
        if (value) {
          headers[header] = value;
        }
      });
    }

    return new CreditResponse({
      data: {
        total_credits,
        total_usage,
      },
      status: 200,
      headers,
    });
  }

  public static createErrorResponse(
    errorCode: string,
    errorMessage: string,
    statusCode: number,
    correlationId: string
  ): {
    status: number;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  } {
    return {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
      },
      body: {
        error: {
          code: errorCode,
          message: errorMessage,
          correlationId,
        },
      },
    };
  }

  public withHeaders(
    additionalHeaders: Record<string, string>
  ): CreditResponse {
    return new CreditResponse({
      data: this.data,
      status: this.status,
      headers: { ...this.headers, ...additionalHeaders },
    });
  }

  public withCacheHeaders(
    cacheStatus: 'HIT' | 'MISS' | 'DISABLED' | 'ERROR'
  ): CreditResponse {
    return this.withHeaders({
      'X-Cache': cacheStatus,
      'Cache-Control':
        cacheStatus === 'HIT' ? 'public, max-age=30' : 'no-cache',
    });
  }

  public static validateKeyResponseData(data: unknown): {
    limit: number | null;
    usage: number;
    byok_usage?: number;
  } {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid key response data: not an object');
    }

    const keyData = data as Record<string, unknown>;

    // Validate usage field (required)
    if (!('usage' in keyData)) {
      throw new Error('Invalid response: missing required usage field');
    }
    if (typeof keyData.usage !== 'number') {
      throw new Error('Invalid data type: usage must be a number');
    }

    if (keyData.usage < 0) {
      throw new Error('Invalid value: usage must be non-negative');
    }

    // Validate limit field (can be null for unlimited accounts)
    if (keyData.limit !== null && typeof keyData.limit !== 'number') {
      throw new Error('Invalid data type: limit must be a number or null');
    }

    if (typeof keyData.limit === 'number' && keyData.limit < 0) {
      throw new Error('Invalid value: limit must be non-negative');
    }

    // Validate byok_usage field (optional, for BYOK accounts)
    let byok_usage: number | undefined;
    if ('byok_usage' in keyData && keyData.byok_usage !== undefined) {
      if (typeof keyData.byok_usage !== 'number') {
        throw new Error('Invalid data type: byok_usage must be a number');
      }
      if (keyData.byok_usage < 0) {
        throw new Error('Invalid value: byok_usage must be non-negative');
      }
      byok_usage = keyData.byok_usage;
    }

    return {
      limit: keyData.limit as number | null,
      usage: keyData.usage as number,
      byok_usage,
    };
  }
}
