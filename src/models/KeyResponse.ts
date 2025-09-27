export interface KeyResponseData {
  limit: number | null;
  usage: number;
  [key: string]: unknown; // Allow additional fields from OpenRouter API
}

export class KeyResponse {
  public readonly limit: number | null;
  public readonly usage: number;
  public readonly additionalFields: Record<string, unknown>;

  constructor(data: KeyResponseData) {
    this.limit = data.limit;
    this.usage = data.usage;

    // Store any additional fields from the response
    const { limit, usage, ...rest } = data;
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
    return Math.max(0, this.limit! - this.usage);
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

  public toJSON(): KeyResponseData {
    return {
      limit: this.limit,
      usage: this.usage,
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
