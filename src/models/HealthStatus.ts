export type HealthStatusValue = 'healthy' | 'unhealthy' | 'degraded';
export type ConnectivityStatus =
  | 'connected'
  | 'disconnected'
  | 'timeout'
  | 'error';
export type CacheStatus = 'operational' | 'degraded' | 'disabled';

export interface HealthStatusData {
  status: HealthStatusValue;
  openrouterConnectivity: ConnectivityStatus;
  cacheStatus?: CacheStatus | undefined;
  uptime: number;
  version: string;
  timestamp: string;
}

export class HealthStatus {
  public readonly status: HealthStatusValue;
  public readonly openrouterConnectivity: ConnectivityStatus;
  public readonly cacheStatus?: CacheStatus | undefined;
  public readonly uptime: number;
  public readonly version: string;
  public readonly timestamp: string;

  constructor(data: HealthStatusData) {
    this.status = data.status;
    this.openrouterConnectivity = data.openrouterConnectivity;
    this.cacheStatus = data.cacheStatus;
    this.uptime = data.uptime;
    this.version = data.version;
    this.timestamp = data.timestamp;

    this.validate();
  }

  private validate(): void {
    // Validate status enum
    const validStatuses: HealthStatusValue[] = [
      'healthy',
      'unhealthy',
      'degraded',
    ];
    if (!validStatuses.includes(this.status)) {
      throw new Error(`Invalid status: ${this.status}`);
    }

    // Validate connectivity status
    const validConnectivity: ConnectivityStatus[] = [
      'connected',
      'disconnected',
      'timeout',
      'error',
    ];
    if (!validConnectivity.includes(this.openrouterConnectivity)) {
      throw new Error(
        `Invalid openrouterConnectivity: ${this.openrouterConnectivity}`
      );
    }

    // Validate cache status if provided
    if (this.cacheStatus) {
      const validCacheStatuses: CacheStatus[] = [
        'operational',
        'degraded',
        'disabled',
      ];
      if (!validCacheStatuses.includes(this.cacheStatus)) {
        throw new Error(`Invalid cacheStatus: ${this.cacheStatus}`);
      }
    }

    // Validate uptime
    if (typeof this.uptime !== 'number' || this.uptime < 0) {
      throw new Error(`Invalid uptime: ${this.uptime}`);
    }

    // Validate version format (semantic versioning)
    if (!this.isValidVersion(this.version)) {
      throw new Error(`Invalid version format: ${this.version}`);
    }

    // Validate timestamp format (ISO 8601)
    if (!this.isValidTimestamp(this.timestamp)) {
      throw new Error(`Invalid timestamp format: ${this.timestamp}`);
    }
  }

  private isValidVersion(version: string): boolean {
    // Basic semantic versioning pattern: X.Y.Z
    const semverPattern =
      /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
    return semverPattern.test(version);
  }

  private isValidTimestamp(timestamp: string): boolean {
    try {
      const date = new Date(timestamp);
      return date.toISOString() === timestamp;
    } catch {
      return false;
    }
  }

  public isHealthy(): boolean {
    return this.status === 'healthy';
  }

  public isDegraded(): boolean {
    return this.status === 'degraded';
  }

  public isUnhealthy(): boolean {
    return this.status === 'unhealthy';
  }

  public hasOpenRouterConnectivity(): boolean {
    return this.openrouterConnectivity === 'connected';
  }

  public isCacheOperational(): boolean {
    return this.cacheStatus === 'operational';
  }

  public getHttpStatusCode(): number {
    switch (this.status) {
      case 'healthy':
        return 200;
      case 'degraded':
        return 200; // Still operational, just degraded
      case 'unhealthy':
        return 503; // Service Unavailable
      default:
        return 500;
    }
  }

  public getUptimeString(): string {
    const seconds = Math.floor(this.uptime % 60);
    const minutes = Math.floor((this.uptime / 60) % 60);
    const hours = Math.floor((this.uptime / 3600) % 24);
    const days = Math.floor(this.uptime / 86400);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  public toJSON(): HealthStatusData {
    return {
      status: this.status,
      openrouterConnectivity: this.openrouterConnectivity,
      cacheStatus: this.cacheStatus,
      uptime: this.uptime,
      version: this.version,
      timestamp: this.timestamp,
    };
  }

  public toExpressResponse(): {
    status: number;
    headers: Record<string, string>;
    body: HealthStatusData;
  } {
    return {
      status: this.getHttpStatusCode(),
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
      body: this.toJSON(),
    };
  }

  public static create(
    openrouterConnectivity: ConnectivityStatus,
    cacheStatus?: CacheStatus,
    startTime?: number,
    version?: string
  ): HealthStatus {
    const now = new Date();
    const uptime = startTime
      ? Math.floor((now.getTime() - startTime) / 1000)
      : 0;

    // Determine overall status based on components
    let status: HealthStatusValue;
    if (
      openrouterConnectivity === 'connected' &&
      (!cacheStatus || cacheStatus === 'operational')
    ) {
      status = 'healthy';
    } else if (openrouterConnectivity === 'connected') {
      status = 'degraded'; // OpenRouter works but cache might be degraded
    } else {
      status = 'unhealthy'; // Cannot connect to OpenRouter
    }

    return new HealthStatus({
      status,
      openrouterConnectivity,
      cacheStatus,
      uptime,
      version: version || '1.0.0',
      timestamp: now.toISOString(),
    });
  }

  public static createHealthy(
    uptime: number = 0,
    version: string = '1.0.0'
  ): HealthStatus {
    return HealthStatus.create(
      'connected',
      'operational',
      Date.now() - uptime * 1000,
      version
    );
  }

  public static createUnhealthy(
    reason: string = 'OpenRouter unavailable',
    version: string = '1.0.0'
  ): HealthStatus {
    return HealthStatus.create('disconnected', undefined, Date.now(), version);
  }

  public static createDegraded(
    openrouterStatus: ConnectivityStatus,
    cacheStatus: CacheStatus,
    uptime: number = 0,
    version: string = '1.0.0'
  ): HealthStatus {
    return HealthStatus.create(
      openrouterStatus,
      cacheStatus,
      Date.now() - uptime * 1000,
      version
    );
  }

  public withUpdatedConnectivity(
    connectivity: ConnectivityStatus
  ): HealthStatus {
    return new HealthStatus({
      ...this.toJSON(),
      openrouterConnectivity: connectivity,
      timestamp: new Date().toISOString(),
    });
  }

  public withUpdatedCacheStatus(cacheStatus: CacheStatus): HealthStatus {
    return new HealthStatus({
      ...this.toJSON(),
      cacheStatus,
      timestamp: new Date().toISOString(),
    });
  }
}
