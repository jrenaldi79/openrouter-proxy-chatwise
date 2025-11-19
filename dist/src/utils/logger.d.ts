export declare class Logger {
    static info(message: string, correlationId?: string, meta?: Record<string, unknown>): void;
    static warn(message: string, correlationId?: string, meta?: Record<string, unknown>): void;
    static error(message: string, correlationId?: string, meta?: Record<string, unknown>): void;
    static debug(message: string, correlationId?: string, meta?: Record<string, unknown>): void;
    static balanceDebug(message: string, correlationId?: string, meta?: Record<string, unknown>): void;
    static request(method: string, path: string, correlationId: string, meta?: Record<string, unknown>): void;
    static response(method: string, path: string, statusCode: number, correlationId: string, duration?: number, meta?: Record<string, unknown>): void;
    static balanceMiddleware(action: string, correlationId: string, meta?: Record<string, unknown>): void;
    static balanceSession(isNew: boolean, messageCount: number, correlationId: string, meta?: Record<string, unknown>): void;
    static balanceClient(isChatWise: boolean, userAgent: string, correlationId: string, meta?: Record<string, unknown>): void;
    static balanceAuth(hasToken: boolean, isValid: boolean, correlationId: string, meta?: Record<string, unknown>): void;
    static balanceStream(isStreaming: boolean, correlationId: string, meta?: Record<string, unknown>): void;
    static balanceEvent(event: string, correlationId: string, meta?: Record<string, unknown>): void;
    static balanceInfo(message: string, correlationId: string, meta?: Record<string, unknown>): void;
    static balanceError(message: string, correlationId: string, error?: Error, meta?: Record<string, unknown>): void;
}
export default Logger;
//# sourceMappingURL=logger.d.ts.map