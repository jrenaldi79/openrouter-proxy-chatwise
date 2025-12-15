export interface EnvironmentConfig {
    PORT: number;
    NODE_ENV: string;
    OPENROUTER_BASE_URL: string;
    OPENROUTER_API_KEY?: string;
    REQUEST_TIMEOUT_MS: number;
    RATE_LIMIT_WINDOW_MS: number;
    RATE_LIMIT_MAX_REQUESTS: number;
    ENABLE_TRANSFORMATION: boolean;
    NODE_TLS_REJECT_UNAUTHORIZED: boolean;
    WANDB_API_KEY?: string;
    WEAVE_PROJECT_NAME?: string;
    WEAVE_API_KEY_ALLOWLIST: string[];
    WEAVE_ENABLED: boolean;
    LANGFUSE_PUBLIC_KEY?: string;
    LANGFUSE_SECRET_KEY?: string;
    LANGFUSE_BASE_URL?: string;
    LANGFUSE_API_KEY_ALLOWLIST: string[];
    LANGFUSE_ENABLED: boolean;
}
export declare function loadEnvironmentConfig(): EnvironmentConfig;
export declare const envConfig: EnvironmentConfig;
export declare function isStreamDebugEnabled(): boolean;
//# sourceMappingURL=environment.d.ts.map