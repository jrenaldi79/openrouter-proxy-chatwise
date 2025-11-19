import { Request, Response } from 'express';
import { AuthToken } from '../models/AuthToken';
import { OpenRouterRequest } from '../models/OpenRouterRequest';
export interface ProxyErrorResponse {
    error: {
        code: string;
        message: string;
        correlationId: string;
    };
}
export declare function validateAuth(req: Request): {
    authToken: AuthToken | null;
    errorResponse: ProxyErrorResponse | null;
};
export declare function createOpenRouterRequest(req: Request, targetPath: string, correlationId: string): OpenRouterRequest;
export declare function mapStatusToErrorCode(status: number): {
    code: string;
    statusCode: number;
};
export declare function createErrorResponse(status: number, data: unknown, correlationId: string): ProxyErrorResponse;
export declare function sendCleanResponse(res: Response, status: number, data: unknown, correlationId: string): void;
//# sourceMappingURL=proxy-utils.d.ts.map