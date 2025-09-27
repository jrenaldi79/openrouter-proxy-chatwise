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
export declare class OpenRouterRequest {
    readonly url: string;
    readonly method: string;
    readonly headers: Record<string, string>;
    readonly body?: unknown;
    readonly timeout: number;
    readonly retryConfig: RetryConfig;
    private static readonly DEFAULT_RETRY_CONFIG;
    constructor(data: OpenRouterRequestData);
    private validate;
    private isValidOpenRouterUrl;
    private requiresAuthentication;
    private validateRetryConfig;
    getAuthorizationHeader(): string | undefined;
    getApiKey(): string | undefined;
    getContentType(): string | undefined;
    getCorrelationId(): string | undefined;
    calculateRetryDelay(attemptNumber: number): number;
    shouldRetry(attemptNumber: number, error: Error): boolean;
    shouldRetryHttpStatus(statusCode: number): boolean;
    withUpdatedHeaders(newHeaders: Record<string, string>): OpenRouterRequest;
    withCorrelationId(correlationId: string): OpenRouterRequest;
    toJSON(): OpenRouterRequestData;
    static fromProxyRequest(proxyRequest: {
        method: string;
        path: string;
        headers: Record<string, string>;
        body?: unknown;
        query: Record<string, string>;
    }, baseUrl: string, timeout: number, retryConfig?: RetryConfig): OpenRouterRequest;
    static createKeyRequest(authorizationHeader: string, baseUrl: string, timeout: number, correlationId: string, retryConfig?: RetryConfig): OpenRouterRequest;
}
//# sourceMappingURL=OpenRouterRequest.d.ts.map