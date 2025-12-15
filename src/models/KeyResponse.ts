export interface KeyResponseData {
  limit: number | null;
  usage: number;
  // BYOK (Bring Your Own Key) fields - tracked separately from regular usage
  byok_usage?: number;
  byok_usage_daily?: number;
  byok_usage_weekly?: number;
  byok_usage_monthly?: number;
  include_byok_in_limit?: boolean;
  [key: string]: unknown; // Allow additional fields from OpenRouter API
}

export class KeyResponse {
  public readonly limit: number | null;
  public readonly usage: number;
  // BYOK (Bring Your Own Key) fields
  public readonly byok_usage?: number;
  public readonly byok_usage_daily?: number;
  public readonly byok_usage_weekly?: number;
  public readonly byok_usage_monthly?: number;
  public readonly include_byok_in_limit?: boolean;
  public readonly additionalFields: Record<string, unknown>;

  constructor(data: KeyResponseData) {
    this.limit = data.limit;
    this.usage = data.usage;

    // Extract BYOK fields
    this.byok_usage = data.byok_usage;
    this.byok_usage_daily = data.byok_usage_daily;
    this.byok_usage_weekly = data.byok_usage_weekly;
    this.byok_usage_monthly = data.byok_usage_monthly;
    this.include_byok_in_limit = data.include_byok_in_limit;

    // Store any additional fields from the response (excluding known fields)
    const {
      limit: _limit,
      usage: _usage,
      byok_usage: _byok_usage,
      byok_usage_daily: _byok_usage_daily,
      byok_usage_weekly: _byok_usage_weekly,
      byok_usage_monthly: _byok_usage_monthly,
      include_byok_in_limit: _include_byok_in_limit,
      ...rest
    } = data;
    this.additionalFields = rest;

    this.validate();
  }

  private validate(): void {
    // Validate usage field (required)
    if (typeof this.usage !== 'number') {
      throw new Error('usage must be a number');
    }

    if (this.usage < 0) {
      throw new Error('usage must be non-negative');
    }

    // Validate limit field (can be null for unlimited accounts)
    if (this.limit !== null && typeof this.limit !== 'number') {
      throw new Error('limit must be a number or null');
    }

    if (typeof this.limit === 'number' && this.limit < 0) {
      throw new Error('limit must be non-negative');
    }
  }

  public isUnlimitedAccount(): boolean {
    return this.limit === null;
  }

  public getRemainingCredits(): number | null {
    if (this.isUnlimitedAccount()) {
      return null; // Unlimited
    }
    // Use effective usage (byok_usage for BYOK accounts) for accurate remaining calculation
    return Math.max(0, this.limit! - this.getEffectiveUsage());
  }

  public getUsagePercentage(): number | null {
    if (this.isUnlimitedAccount()) {
      return null; // Cannot calculate percentage for unlimited accounts
    }

    if (this.limit === 0) {
      return this.usage > 0 ? 100 : 0;
    }

    return (this.usage / this.limit!) * 100;
  }

  public hasExceededLimit(): boolean {
    if (this.isUnlimitedAccount()) {
      return false;
    }
    return this.usage > this.limit!;
  }

  /**
   * Returns true if this account primarily uses BYOK (Bring Your Own Key).
   * A BYOK account has byok_usage > 0 and either:
   * - Regular usage is negligible (< $0.01), OR
   * - BYOK usage is greater than regular usage
   */
  public isByokAccount(): boolean {
    const byokUsage = this.byok_usage ?? 0;
    if (byokUsage <= 0) {
      return false;
    }
    // Consider BYOK if regular usage is negligible OR BYOK is the dominant usage
    return this.usage < 0.01 || byokUsage > this.usage;
  }

  /**
   * Returns the effective usage to display to users.
   * For BYOK accounts: returns byok_usage (the actual cost incurred)
   * For regular accounts: returns regular usage
   */
  public getEffectiveUsage(): number {
    return this.isByokAccount() ? (this.byok_usage ?? 0) : this.usage;
  }

  public toJSON(): KeyResponseData {
    const result: KeyResponseData = {
      limit: this.limit,
      usage: this.usage,
    };

    // Include BYOK fields if present
    if (this.byok_usage !== undefined) {
      result.byok_usage = this.byok_usage;
    }
    if (this.byok_usage_daily !== undefined) {
      result.byok_usage_daily = this.byok_usage_daily;
    }
    if (this.byok_usage_weekly !== undefined) {
      result.byok_usage_weekly = this.byok_usage_weekly;
    }
    if (this.byok_usage_monthly !== undefined) {
      result.byok_usage_monthly = this.byok_usage_monthly;
    }
    if (this.include_byok_in_limit !== undefined) {
      result.include_byok_in_limit = this.include_byok_in_limit;
    }

    return {
      ...result,
      ...this.additionalFields,
    };
  }

  public static fromApiResponse(response: unknown): KeyResponse {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid API response: not an object');
    }

    const data = response as Record<string, unknown>;

    // Validate required fields
    if (!('usage' in data)) {
      throw new Error('Invalid API response: missing usage field');
    }

    return new KeyResponse(data as KeyResponseData);
  }

  public static isValidResponse(data: unknown): boolean {
    try {
      KeyResponse.fromApiResponse(data);
      return true;
    } catch {
      return false;
    }
  }
}
