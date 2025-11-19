export interface AccumulatedStreamResponse {
    id: string | null;
    model: string | null;
    created: number | null;
    content: string;
    role: string;
    finishReason: string | null;
    usage: {
        promptTokens: number | null;
        completionTokens: number | null;
        totalTokens: number | null;
    };
    error: string | null;
}
interface SSEChunk {
    id?: string;
    model?: string;
    created?: number;
    choices?: Array<{
        index: number;
        delta?: {
            role?: string;
            content?: string;
        };
        finish_reason?: string | null;
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
}
export declare function parseSSEBuffer(buffer: string, correlationId: string): SSEChunk[];
export declare function accumulateStreamResponse(chunks: SSEChunk[], correlationId: string): AccumulatedStreamResponse;
export declare function parseAndAccumulateSSE(buffer: string, correlationId: string): AccumulatedStreamResponse;
export {};
//# sourceMappingURL=sse-parser.d.ts.map