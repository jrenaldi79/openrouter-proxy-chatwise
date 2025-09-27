export class AuthToken {
  public readonly raw: string;
  public readonly token: string;
  public readonly isValid: boolean;
  public readonly format: string;

  private static readonly OPENROUTER_TOKEN_PATTERN = /^sk-or-v1-.+/;
  private static readonly BEARER_PREFIX = 'Bearer ';

  constructor(authorizationHeader: string) {
    this.raw = authorizationHeader;
    this.format = 'sk-or-v1-{key}';

    const { token, isValid } = this.parseAndValidate(authorizationHeader);
    this.token = token;
    this.isValid = isValid;
  }

  private parseAndValidate(authHeader: string): {
    token: string;
    isValid: boolean;
  } {
    // Check if header starts with Bearer
    if (!authHeader.startsWith(AuthToken.BEARER_PREFIX)) {
      return { token: '', isValid: false };
    }

    // Extract token (remove 'Bearer ' prefix)
    const token = authHeader.substring(AuthToken.BEARER_PREFIX.length);

    // Validate token format
    const isValid = this.validateTokenFormat(token);

    return { token, isValid };
  }

  private validateTokenFormat(token: string): boolean {
    // Check for empty or whitespace-only token
    if (!token || token.trim() !== token || token.length === 0) {
      return false;
    }

    // Check OpenRouter-specific format
    if (!AuthToken.OPENROUTER_TOKEN_PATTERN.test(token)) {
      return false;
    }

    // Basic length check (OpenRouter tokens should be reasonably long)
    if (token.length < 10) {
      return false;
    }

    // Check for obvious invalid characters (basic validation)
    if (token.includes(' ') || token.includes('\n') || token.includes('\t')) {
      return false;
    }

    return true;
  }

  public getTokenHash(): string {
    // Create a hash of the token for logging/caching without exposing the actual key
    // This is a simple hash - in production, you might want a more robust solution
    if (!this.token) {
      return '';
    }

    const hash = this.token
      .split('')
      .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);

    return Math.abs(hash).toString(16);
  }

  public getMaskedToken(): string {
    if (!this.token || this.token.length < 8) {
      return '***';
    }

    // Show first 4 and last 4 characters, mask the middle
    const start = this.token.substring(0, 4);
    const end = this.token.substring(this.token.length - 4);
    const maskLength = Math.max(3, this.token.length - 8);
    const mask = '*'.repeat(maskLength);

    return `${start}${mask}${end}`;
  }

  public getAuthorizationHeader(): string {
    return this.raw;
  }

  public toSafeJSON(): Record<string, unknown> {
    return {
      format: this.format,
      isValid: this.isValid,
      tokenHash: this.getTokenHash(),
      maskedToken: this.getMaskedToken(),
    };
  }

  public static fromRequest(req: {
    headers: Record<string, string | string[] | undefined>;
  }): AuthToken | null {
    const authHeader =
      req.headers['authorization'] || req.headers['Authorization'];

    // Handle string array case by taking the first value
    const authHeaderString = Array.isArray(authHeader)
      ? authHeader[0]
      : authHeader;

    if (!authHeaderString) {
      return null;
    }

    return new AuthToken(authHeaderString);
  }

  public static isValidFormat(authorizationHeader: string): boolean {
    try {
      const authToken = new AuthToken(authorizationHeader);
      return authToken.isValid;
    } catch {
      return false;
    }
  }

  public static validateBearerToken(token: string): boolean {
    return AuthToken.OPENROUTER_TOKEN_PATTERN.test(token);
  }

  public static createBearerHeader(token: string): string {
    if (!token.startsWith(AuthToken.BEARER_PREFIX)) {
      return `${AuthToken.BEARER_PREFIX}${token}`;
    }
    return token;
  }

  public static extractToken(authorizationHeader: string): string | null {
    if (!authorizationHeader.startsWith(AuthToken.BEARER_PREFIX)) {
      return null;
    }

    const token = authorizationHeader.substring(AuthToken.BEARER_PREFIX.length);
    return AuthToken.validateBearerToken(token) ? token : null;
  }

  // Timing-safe comparison to prevent timing attacks
  public static secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  public equals(other: AuthToken): boolean {
    return AuthToken.secureCompare(this.token, other.token);
  }

  public isEmpty(): boolean {
    return !this.token || this.token.length === 0;
  }
}
