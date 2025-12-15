export type Provider = 'anthropic' | 'openai' | 'gemini' | 'grok' | 'unknown';
export type WarningLevel = 'none' | 'info' | 'warning' | 'critical';
export interface ModelLimits {
    maxContextTokens: number;
    provider: Provider;
}
export declare function getModelLimits(model: string): ModelLimits;
export declare function getWarningPercentage(promptTokens: number, limits: ModelLimits): number;
export declare function getWarningLevel(promptTokens: number, limits: ModelLimits): WarningLevel;
//# sourceMappingURL=model-limits.d.ts.map