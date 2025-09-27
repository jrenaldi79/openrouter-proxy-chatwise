export interface CreditData {
    total_credits: number;
    total_usage: number;
}
export interface CreditResponseData {
    data: CreditData;
    status?: number;
    headers?: Record<string, string>;
}
export declare class CreditResponse {
    readonly data: CreditData;
    readonly status: number;
    readonly headers: Record<string, string>;
    constructor(responseData: CreditResponseData);
    private validate;
    isUnlimitedAccount(): boolean;
    getRemainingCredits(): number;
    getUsagePercentage(): number;
    isNearLimit(threshold?: number): boolean;
    hasExceededLimit(): boolean;
    toJSON(): Record<string, unknown>;
    toExpressResponse(): {
        status: number;
        headers: Record<string, string>;
        body: Record<string, unknown>;
    };
    static fromKeyResponse(keyResponse: {
        limit: number | null;
        usage: number;
    }, correlationId?: string, preservedHeaders?: Record<string, string>): CreditResponse;
    static createErrorResponse(errorCode: string, errorMessage: string, statusCode: number, correlationId: string): {
        status: number;
        headers: Record<string, string>;
        body: Record<string, unknown>;
    };
    withHeaders(additionalHeaders: Record<string, string>): CreditResponse;
    withCacheHeaders(cacheStatus: 'HIT' | 'MISS' | 'DISABLED' | 'ERROR'): CreditResponse;
    static validateKeyResponseData(data: unknown): {
        limit: number | null;
        usage: number;
    };
}
//# sourceMappingURL=CreditResponse.d.ts.map