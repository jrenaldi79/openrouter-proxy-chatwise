export interface ProxyRequestData {
    method: string;
    path: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    body?: unknown;
    correlationId?: string;
}
export declare class ProxyRequest {
    readonly method: string;
    readonly path: string;
    readonly headers: Record<string, string>;
    readonly query: Record<string, string>;
    readonly body?: unknown;
    readonly correlationId: string;
    constructor(data: ProxyRequestData);
    private validate;
    getAuthorizationHeader(): string | undefined;
    getApiKey(): string | undefined;
    isValidApiKeyFormat(authHeader: string): boolean;
    isCreditEndpoint(): boolean;
    isHealthEndpoint(): boolean;
    private validateHeaderSecurity;
    getQueryParameter(key: string): string | undefined;
    hasQueryParameter(key: string): boolean;
    getContentType(): string | undefined;
    isJsonContent(): boolean;
    getContentLength(): number | undefined;
    toJSON(): ProxyRequestData;
    static fromExpressRequest(req: any): ProxyRequest;
}
//# sourceMappingURL=ProxyRequest.d.ts.map