export type HealthStatusValue = 'healthy' | 'unhealthy' | 'degraded';
export type ConnectivityStatus = 'connected' | 'disconnected' | 'timeout' | 'error';
export type CacheStatus = 'operational' | 'degraded' | 'disabled';
export interface HealthStatusData {
    status: HealthStatusValue;
    openrouterConnectivity: ConnectivityStatus;
    cacheStatus?: CacheStatus | undefined;
    uptime: number;
    version: string;
    timestamp: string;
}
export declare class HealthStatus {
    readonly status: HealthStatusValue;
    readonly openrouterConnectivity: ConnectivityStatus;
    readonly cacheStatus?: CacheStatus | undefined;
    readonly uptime: number;
    readonly version: string;
    readonly timestamp: string;
    constructor(data: HealthStatusData);
    private validate;
    private isValidVersion;
    private isValidTimestamp;
    isHealthy(): boolean;
    isDegraded(): boolean;
    isUnhealthy(): boolean;
    hasOpenRouterConnectivity(): boolean;
    isCacheOperational(): boolean;
    getHttpStatusCode(): number;
    getUptimeString(): string;
    toJSON(): HealthStatusData;
    toExpressResponse(): {
        status: number;
        headers: Record<string, string>;
        body: HealthStatusData;
    };
    static create(openrouterConnectivity: ConnectivityStatus, cacheStatus?: CacheStatus, startTime?: number, version?: string): HealthStatus;
    static createHealthy(uptime?: number, version?: string): HealthStatus;
    static createUnhealthy(reason?: string, version?: string): HealthStatus;
    static createDegraded(openrouterStatus: ConnectivityStatus, cacheStatus: CacheStatus, uptime?: number, version?: string): HealthStatus;
    withUpdatedConnectivity(connectivity: ConnectivityStatus): HealthStatus;
    withUpdatedCacheStatus(cacheStatus: CacheStatus): HealthStatus;
}
//# sourceMappingURL=HealthStatus.d.ts.map