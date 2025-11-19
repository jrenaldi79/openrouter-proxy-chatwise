import { Request, Response, NextFunction } from 'express';
import { weave } from '../config/weave';
import { OpenRouterRequest } from '../models/OpenRouterRequest';
import { ProxyResponse } from '../services/ProxyService';
interface ChatMessage {
    role: string;
    content: string;
}
export declare function weaveTracingMiddleware(req: Request, res: Response, next: NextFunction): void;
interface LLMCompletionResponse {
    id: string;
    created: number;
    model: string;
    object: string;
    choices: Array<{
        finish_reason: string | null;
        index: number;
        message: {
            content: string;
            role: string;
            [key: string]: any;
        };
    }>;
    usage: {
        completion_tokens: number;
        prompt_tokens: number;
        total_tokens: number;
        [key: string]: any;
    };
    [key: string]: any;
}
export declare function createTracedLLMCall(proxyFn: (request: OpenRouterRequest) => Promise<ProxyResponse>, openRouterRequest: OpenRouterRequest): weave.Op<(input: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    n?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    correlationId?: string;
}) => Promise<LLMCompletionResponse>>;
export {};
//# sourceMappingURL=weave-tracing.d.ts.map