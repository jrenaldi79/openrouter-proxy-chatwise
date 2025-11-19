import { AccumulatedStreamResponse } from './sse-parser';
export interface TracingInput {
    model: string;
    messages: Array<{
        role: string;
        content: string;
    }>;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    n?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
}
export declare function traceStreamingCompletion(input: TracingInput, response: AccumulatedStreamResponse, correlationId: string, hasWeaveData: boolean, hasLangfuseData: boolean): Promise<void>;
//# sourceMappingURL=async-tracer.d.ts.map