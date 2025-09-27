import { OpenRouterRequest } from '../models/OpenRouterRequest';
export interface ProxyResponse {
    status: number;
    headers: Record<string, string>;
    data: unknown;
}
export declare class ProxyService {
    private readonly baseUrl;
    constructor(baseUrl?: string, _defaultTimeout?: number);
    makeRequest(request: OpenRouterRequest): Promise<ProxyResponse>;
    private executeRequest;
    private formatResponse;
    private shouldRetry;
    private formatError;
    private sleep;
    checkConnectivity(): Promise<boolean>;
}
//# sourceMappingURL=ProxyService.d.ts.map