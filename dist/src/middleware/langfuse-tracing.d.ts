import { Request, Response, NextFunction } from 'express';
import { OpenRouterRequest } from '../models/OpenRouterRequest';
import { ProxyResponse } from '../services/ProxyService';
interface ChatMessage {
    role: string;
    content: string;
}
export declare function langfuseTracingMiddleware(req: Request, res: Response, next: NextFunction): void;
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
export declare function createTracedLangfuseLLMCall(proxyFn: (request: OpenRouterRequest) => Promise<ProxyResponse>, openRouterRequest: OpenRouterRequest, llmInput: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    n?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    correlationId?: string;
}): () => Promise<LLMCompletionResponse>;
export {};
//# sourceMappingURL=langfuse-tracing.d.ts.map