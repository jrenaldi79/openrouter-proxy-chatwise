"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthStatus = void 0;
class HealthStatus {
    constructor(data) {
        this.status = data.status;
        this.openrouterConnectivity = data.openrouterConnectivity;
        this.cacheStatus = data.cacheStatus;
        this.uptime = data.uptime;
        this.version = data.version;
        this.timestamp = data.timestamp;
        this.validate();
    }
    validate() {
        const validStatuses = [
            'healthy',
            'unhealthy',
            'degraded',
        ];
        if (!validStatuses.includes(this.status)) {
            throw new Error(`Invalid status: ${this.status}`);
        }
        const validConnectivity = [
            'connected',
            'disconnected',
            'timeout',
            'error',
        ];
        if (!validConnectivity.includes(this.openrouterConnectivity)) {
            throw new Error(`Invalid openrouterConnectivity: ${this.openrouterConnectivity}`);
        }
        if (this.cacheStatus) {
            const validCacheStatuses = [
                'operational',
                'degraded',
                'disabled',
            ];
            if (!validCacheStatuses.includes(this.cacheStatus)) {
                throw new Error(`Invalid cacheStatus: ${this.cacheStatus}`);
            }
        }
        if (typeof this.uptime !== 'number' || this.uptime < 0) {
            throw new Error(`Invalid uptime: ${this.uptime}`);
        }
        if (!this.isValidVersion(this.version)) {
            throw new Error(`Invalid version format: ${this.version}`);
        }
        if (!this.isValidTimestamp(this.timestamp)) {
            throw new Error(`Invalid timestamp format: ${this.timestamp}`);
        }
    }
    isValidVersion(version) {
        const semverPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
        return semverPattern.test(version);
    }
    isValidTimestamp(timestamp) {
        try {
            const date = new Date(timestamp);
            return date.toISOString() === timestamp;
        }
        catch {
            return false;
        }
    }
    isHealthy() {
        return this.status === 'healthy';
    }
    isDegraded() {
        return this.status === 'degraded';
    }
    isUnhealthy() {
        return this.status === 'unhealthy';
    }
    hasOpenRouterConnectivity() {
        return this.openrouterConnectivity === 'connected';
    }
    isCacheOperational() {
        return this.cacheStatus === 'operational';
    }
    getHttpStatusCode() {
        switch (this.status) {
            case 'healthy':
                return 200;
            case 'degraded':
                return 200;
            case 'unhealthy':
                return 503;
            default:
                return 500;
        }
    }
    getUptimeString() {
        const seconds = Math.floor(this.uptime % 60);
        const minutes = Math.floor((this.uptime / 60) % 60);
        const hours = Math.floor((this.uptime / 3600) % 24);
        const days = Math.floor(this.uptime / 86400);
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m ${seconds}s`;
        }
        else if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        }
        else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        }
        else {
            return `${seconds}s`;
        }
    }
    toJSON() {
        return {
            status: this.status,
            openrouterConnectivity: this.openrouterConnectivity,
            cacheStatus: this.cacheStatus,
            uptime: this.uptime,
            version: this.version,
            timestamp: this.timestamp,
        };
    }
    toExpressResponse() {
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
    static create(openrouterConnectivity, cacheStatus, startTime, version) {
        const now = new Date();
        const uptime = startTime
            ? Math.floor((now.getTime() - startTime) / 1000)
            : 0;
        let status;
        if (openrouterConnectivity === 'connected' &&
            (!cacheStatus || cacheStatus === 'operational')) {
            status = 'healthy';
        }
        else if (openrouterConnectivity === 'connected') {
            status = 'degraded';
        }
        else {
            status = 'unhealthy';
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
    static createHealthy(uptime = 0, version = '1.0.0') {
        return HealthStatus.create('connected', 'operational', Date.now() - uptime * 1000, version);
    }
    static createUnhealthy(reason = 'OpenRouter unavailable', version = '1.0.0') {
        return HealthStatus.create('disconnected', undefined, Date.now(), version);
    }
    static createDegraded(openrouterStatus, cacheStatus, uptime = 0, version = '1.0.0') {
        return HealthStatus.create(openrouterStatus, cacheStatus, Date.now() - uptime * 1000, version);
    }
    withUpdatedConnectivity(connectivity) {
        return new HealthStatus({
            ...this.toJSON(),
            openrouterConnectivity: connectivity,
            timestamp: new Date().toISOString(),
        });
    }
    withUpdatedCacheStatus(cacheStatus) {
        return new HealthStatus({
            ...this.toJSON(),
            cacheStatus,
            timestamp: new Date().toISOString(),
        });
    }
}
exports.HealthStatus = HealthStatus;
//# sourceMappingURL=HealthStatus.js.map