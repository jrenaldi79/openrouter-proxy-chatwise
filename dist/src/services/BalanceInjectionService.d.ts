import { AuthToken } from '../models/AuthToken';
import { ProxyService } from './ProxyService';
export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}
export interface ChatCompletionRequest {
    messages: ChatMessage[];
    model?: string;
    stream?: boolean;
    max_tokens?: number;
    temperature?: number;
    [key: string]: unknown;
}
export interface StreamingChunk {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        delta: {
            role?: string;
            content?: string;
        };
        finish_reason: string | null;
    }>;
}
export declare class BalanceInjectionService {
    private proxyService;
    private openrouterBaseUrl;
    private requestTimeoutMs;
    constructor(proxyService: ProxyService, openrouterBaseUrl: string, requestTimeoutMs: number);
    isNewSession(request: ChatCompletionRequest): boolean;
    getUserBalance(authToken: AuthToken, correlationId: string): Promise<{
        totalCredits: number;
        usedCredits: number;
    } | null>;
    createBalanceChunk(chatId: string, model: string, balance: {
        totalCredits: number;
        usedCredits: number;
    }): StreamingChunk;
    createCompletionChunk(chatId: string, model: string): StreamingChunk;
    formatAsSSE(chunk: StreamingChunk): string;
    generateChatId(): string;
}
//# sourceMappingURL=BalanceInjectionService.d.ts.map