export interface ModelLimitsData {
    maxContextTokens: number;
    maxPromptTokens: number;
}
export declare class ModelDataService {
    private modelCache;
    private initialized;
    private lastFetchTime;
    fetchModels(): Promise<boolean>;
    getModelLimits(modelId: string): ModelLimitsData | null;
    isInitialized(): boolean;
    getModelCount(): number;
    getLastFetchTime(): number | null;
}
//# sourceMappingURL=ModelDataService.d.ts.map